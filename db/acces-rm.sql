-- =====================================================================
-- MOMENTO · Brique RM (Regional Manager) — à coller dans Supabase > SQL Editor
--
-- Noms repris du code de l'app (aucune supposition) :
--   managers     (id, user_id, nom, equipe)          user_id = le compte de connexion (auth.uid())
--   commerciaux  (id, manager_id, nom, actif, …)     manager_id → managers.id
--   kpis_mensuels(commercial_id, mois, donnees)      commercial_id → commerciaux.id
--   entretiens   (commercial_id, mois, contenu, …)   commercial_id → commerciaux.id
-- Le type des identifiants n'apparaît pas dans le code : le script reprend tout seul celui de managers.id.
--
-- Tout ou rien : si une instruction échoue, rien n'est appliqué.
-- Rien ne change pour les TM : on AJOUTE seulement des droits de LECTURE pour les RM.
-- =====================================================================
begin;

-- 1. Le rôle de chaque manager : 'TM' (tous les comptes actuels, par défaut) ou 'RM'.
alter table public.managers
  add column if not exists role text not null default 'TM' check (role in ('TM', 'RM'));

-- 2. Le lien RM ↔ TM (un RM suit plusieurs TM), avec le même type d'identifiant que managers.id.
do $$
declare
  type_id text;
begin
  select format_type(a.atttypid, a.atttypmod) into type_id
  from pg_attribute a
  where a.attrelid = 'public.managers'::regclass and a.attname = 'id';

  execute format(
    'create table if not exists public.rm_tms (
       rm_id %1$s not null references public.managers (id) on delete cascade,
       tm_id %1$s not null references public.managers (id) on delete cascade,
       primary key (rm_id, tm_id),
       check (rm_id <> tm_id)
     )',
    type_id
  );
end $$;

-- Les comptes connectés peuvent LIRE rm_tms (la règle RLS plus bas limite chacun à ses propres liens).
grant select on public.rm_tms to authenticated;

alter table public.rm_tms enable row level security;
-- Personne ne crée ni ne modifie de lien depuis l'app : les liens se font ici, dans le SQL Editor.
revoke insert, update, delete on public.rm_tms from anon, authenticated;

-- 3. « Le compte connecté est-il le RM de ce TM ? » (vrai / faux).
--    security definer : la fonction lit rm_tms et managers sans repasser par leurs règles RLS
--    (sinon la règle de managers s'appellerait elle-même en boucle).
create or replace function public.rm_lit_le_tm(p_tm public.managers.id%type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rm_tms l
    join public.managers m on m.id = l.rm_id
    where l.tm_id = p_tm
      and m.role = 'RM'
      and m.user_id::text = auth.uid()::text
  )
$$;
revoke all on function public.rm_lit_le_tm(public.managers.id%type) from public, anon;
grant execute on function public.rm_lit_le_tm(public.managers.id%type) to authenticated;

-- 4. Règles de LECTURE ajoutées. Elles s'ajoutent aux règles actuelles (qui ne sont pas touchées) :
--    pour un TM, rm_lit_le_tm(...) est toujours faux, donc elles ne lui ouvrent rien de plus.

-- Le RM lit ses propres liens RM ↔ TM.
drop policy if exists "RM lit ses liens" on public.rm_tms;
create policy "RM lit ses liens" on public.rm_tms
  for select to authenticated
  using (exists (
    select 1 from public.managers m
    where m.id = rm_tms.rm_id and m.user_id::text = auth.uid()::text
  ));

-- Le RM lit la fiche (nom, région) de ses TM.
drop policy if exists "RM lit ses TM" on public.managers;
create policy "RM lit ses TM" on public.managers
  for select to authenticated
  using (public.rm_lit_le_tm(id));

-- Le RM lit les commerciaux de ses TM.
drop policy if exists "RM lit les commerciaux de ses TM" on public.commerciaux;
create policy "RM lit les commerciaux de ses TM" on public.commerciaux
  for select to authenticated
  using (public.rm_lit_le_tm(manager_id));

-- Le RM lit les chiffres des commerciaux de ses TM.
drop policy if exists "RM lit les chiffres de ses TM" on public.kpis_mensuels;
create policy "RM lit les chiffres de ses TM" on public.kpis_mensuels
  for select to authenticated
  using (exists (
    select 1 from public.commerciaux c
    where c.id = kpis_mensuels.commercial_id and public.rm_lit_le_tm(c.manager_id)
  ));

-- Le RM lit les 1:1 des commerciaux de ses TM.
drop policy if exists "RM lit les 1:1 de ses TM" on public.entretiens;
create policy "RM lit les 1:1 de ses TM" on public.entretiens
  for select to authenticated
  using (exists (
    select 1 from public.commerciaux c
    where c.id = entretiens.commercial_id and public.rm_lit_le_tm(c.manager_id)
  ));

commit;

-- =====================================================================
-- 5. PLUS TARD (à adapter, puis à lancer à part) : déclarer un RM et lui rattacher ses TM.
--    Le RM doit déjà avoir un compte de connexion ET une ligne dans managers. Remplace les e-mails.
--
-- update public.managers set role = 'RM'
--   where user_id::text = (select id::text from auth.users where email = 'rm@exemple.fr');
--
-- insert into public.rm_tms (rm_id, tm_id)
--   select rm.id, tm.id
--   from public.managers rm, public.managers tm
--   where rm.user_id::text = (select id::text from auth.users where email = 'rm@exemple.fr')
--     and tm.user_id::text in (select id::text from auth.users where email in ('tm1@exemple.fr', 'tm2@exemple.fr'))
-- on conflict do nothing;
-- =====================================================================
