-- =====================================================================
-- MOMENTO · Brique 2 — Stockage de l'import du BI RM + 1:1 des TM
-- À coller dans Supabase > SQL Editor, APRÈS db/acces-rm.sql (fonction rm_lit_le_tm).
-- Tout ou rien (begin / commit), relançable. Ne touche à AUCUNE table existante :
-- les chiffres que les TM importent eux-mêmes (kpis_mensuels) et leurs 1:1 (entretiens) restent intacts.
-- Les types d'identifiants sont repris tout seuls de managers.id et commerciaux.id.
-- =====================================================================
begin;

-- 1. « Ce manager-là, c'est moi, et je suis RM ? » (vrai / faux).
create or replace function public.rm_moi(p_rm public.managers.id%type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.managers m
    where m.id = p_rm and m.role = 'RM' and m.user_id::text = auth.uid()::text
  )
$$;
revoke all on function public.rm_moi(public.managers.id%type) from public, anon;
grant execute on function public.rm_moi(public.managers.id%type) to authenticated;

-- 2. Les deux tables, avec le même type d'identifiant que managers.id et commerciaux.id.
do $$
declare
  t_manager text;
  t_commercial text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_manager
  from pg_attribute a where a.attrelid = 'public.managers'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into t_commercial
  from pg_attribute a where a.attrelid = 'public.commerciaux'::regclass and a.attname = 'id';

  -- 2a. Le BI RM, ligne par ligne, tel qu'importé : la ligne Région, chaque ligne agrégée TM,
  --     et chaque ligne sales sous son TM. Un import = toutes les lignes d'un RM pour un mois.
  execute format($t$
    create table if not exists public.bi_rm_lignes (
      id            bigint generated always as identity primary key,
      rm_id         %1$s not null references public.managers (id) on delete cascade,  -- le RM qui a importé
      mois          text not null,                                                    -- « Septembre 2026 », comme ailleurs
      rang          integer not null,                                                 -- n° de ligne dans le BI (1, 2, 3…)
      niveau        text not null check (niveau in ('region', 'tm', 'sales')),
      tm_id         %1$s references public.managers (id) on delete cascade,           -- le TM (vide pour la ligne Région)
      commercial_id %2$s references public.commerciaux (id) on delete set null,       -- le sales reconnu (vide si nom inconnu)
      nom           text not null,                                                    -- le nom tel que lu dans le BI
      donnees       jsonb not null default '{}'::jsonb,                               -- tous les chiffres lus de la ligne
      importe_le    timestamptz not null default now(),
      unique (rm_id, mois, rang),
      check ((niveau = 'region') = (tm_id is null)),                                  -- Région sans TM ; TM et sales avec
      check (commercial_id is null or niveau = 'sales')
    )$t$, t_manager, t_commercial);

  -- 2b. Les 1:1 du RM avec chacun de ses TM (même contenu que la table entretiens des commerciaux).
  execute format($t$
    create table if not exists public.entretiens_tm (
      id         bigint generated always as identity primary key,
      rm_id      %1$s not null references public.managers (id) on delete cascade,
      tm_id      %1$s not null references public.managers (id) on delete cascade,
      mois       text not null,
      contenu    jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      unique (rm_id, tm_id, mois)
    )$t$, t_manager);
end $$;

create index if not exists bi_rm_lignes_tm_mois on public.bi_rm_lignes (tm_id, mois);

-- 3. Droits : seuls les comptes connectés, et la RLS ci-dessous décide qui voit quoi.
alter table public.bi_rm_lignes enable row level security;
alter table public.entretiens_tm enable row level security;
revoke all on public.bi_rm_lignes, public.entretiens_tm from anon;
grant select, insert, update, delete on public.bi_rm_lignes, public.entretiens_tm to authenticated;

-- 4. Règles : un RM ne lit et n'écrit que SES lignes, et seulement pour SES TM (et leurs sales).
--    Les TM n'ont aucun accès à ces deux tables pour l'instant.
drop policy if exists "RM gère son BI" on public.bi_rm_lignes;
create policy "RM gère son BI" on public.bi_rm_lignes
  for all to authenticated
  using (public.rm_moi(rm_id) and (tm_id is null or public.rm_lit_le_tm(tm_id)))
  with check (
    public.rm_moi(rm_id)
    and (tm_id is null or public.rm_lit_le_tm(tm_id))
    -- un sales rattaché doit bien appartenir à ce TM
    and (commercial_id is null or exists (
      select 1 from public.commerciaux c where c.id = bi_rm_lignes.commercial_id and c.manager_id = bi_rm_lignes.tm_id
    ))
  );

drop policy if exists "RM gère ses 1:1 TM" on public.entretiens_tm;
create policy "RM gère ses 1:1 TM" on public.entretiens_tm
  for all to authenticated
  using (public.rm_moi(rm_id) and public.rm_lit_le_tm(tm_id))
  with check (public.rm_moi(rm_id) and public.rm_lit_le_tm(tm_id));

-- 5. Remplacer l'import d'un mois EN UNE FOIS : on efface les lignes du RM pour ce mois puis on insère
--    les nouvelles, dans la même transaction (jamais d'import à moitié). Droits de l'utilisateur : la RLS s'applique.
--    p_lignes = [{ "rang": 1, "niveau": "region", "tm_id": null, "commercial_id": null, "nom": "…", "donnees": {…} }, …]
create or replace function public.remplacer_bi_rm(p_mois text, p_lignes jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rm public.managers.id%type;
  v_nb integer;
begin
  select m.id into v_rm from public.managers m where m.user_id::text = auth.uid()::text and m.role = 'RM';
  if v_rm is null then
    raise exception 'Import réservé aux RM.';
  end if;

  delete from public.bi_rm_lignes where rm_id = v_rm and mois = p_mois;

  insert into public.bi_rm_lignes (rm_id, mois, rang, niveau, tm_id, commercial_id, nom, donnees)
  select v_rm, p_mois, r.rang, r.niveau, r.tm_id, r.commercial_id, r.nom, coalesce(r.donnees, '{}'::jsonb)
  from jsonb_populate_recordset(null::public.bi_rm_lignes, p_lignes) r;

  get diagnostics v_nb = row_count;
  return v_nb; -- nombre de lignes enregistrées
end;
$$;
revoke all on function public.remplacer_bi_rm(text, jsonb) from public, anon;
grant execute on function public.remplacer_bi_rm(text, jsonb) to authenticated;

commit;

-- =====================================================================
-- POUR TOUT ANNULER (à lancer seul) — n'efface que ce que ce script a créé :
-- begin;
-- drop function if exists public.remplacer_bi_rm;
-- drop table if exists public.entretiens_tm;
-- drop table if exists public.bi_rm_lignes;
-- drop function if exists public.rm_moi;
-- commit;
-- =====================================================================
