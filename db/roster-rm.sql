-- =====================================================================
-- MOMENTO · Brique 6 — Gestion du roster depuis l'accès RM + date de début des TM
-- À coller dans Supabase > SQL Editor, APRÈS db/auto-creation-tm.sql.
-- Tout ou rien (begin / commit), relançable. Ne modifie AUCUNE donnée existante.
-- Le RM n'obtient toujours AUCUN droit d'écriture direct : tout passe par les fonctions ci-dessous, qui vérifient
-- que le TM (ou le commercial) fait bien partie de SES TM. Rien ne change pour les TM.
-- =====================================================================
begin;

-- 1. La date de début d'un TM (« Avril 2026 ») : purement informative. Un TM ne monte pas en séniorité :
--    il est toujours jugé à fond, sa date de début ne réduit jamais ses objectifs.
alter table public.managers add column if not exists date_debut text;

-- Le mois de démarrage d'un commercial (déjà utilisé par l'accès TM) : créé seulement s'il manque.
alter table public.commerciaux add column if not exists demarrage text;

-- 2. Modifier un commercial d'un de SES TM : nom, parti (actif = false) ou revenu, démarrage, niveau, budget.
--    p_changes = {"nom": "…", "actif": false, "demarrage": "Avril 2026" | null, "seniorite": "M1", "budget": 5}
--    (seules les clés présentes sont modifiées).
create or replace function public.rm_modifier_commercial(p_commercial text, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tm public.managers.id%type;
begin
  select c.manager_id into v_tm from public.commerciaux c where c.id::text = p_commercial;
  if v_tm is null or not public.rm_lit_le_tm(v_tm) then
    raise exception 'Ce commercial ne fait pas partie de tes TM.';
  end if;

  if p_changes ? 'nom' then
    if public.nom_cle(p_changes->>'nom') = '' then
      raise exception 'Le nom ne peut pas être vide.';
    end if;
    if exists (select 1 from public.commerciaux c
               where c.manager_id = v_tm and c.actif and c.id::text <> p_commercial
                 and public.nom_cle(c.nom) = public.nom_cle(p_changes->>'nom')) then
      raise exception '% fait déjà partie de cette équipe.', trim(p_changes->>'nom');
    end if;
  end if;
  if p_changes ? 'seniorite' and p_changes->>'seniorite' not in ('M1', 'M2', 'M3+') then
    raise exception 'Niveau invalide (M1, M2 ou M3+).';
  end if;
  if p_changes ? 'budget' and p_changes->>'budget' not in ('5', '10', '15') then
    raise exception 'Budget invalide (5, 10 ou 15).';
  end if;

  update public.commerciaux c set
    nom        = case when p_changes ? 'nom' then trim(p_changes->>'nom') else c.nom end,
    actif      = case when p_changes ? 'actif' then (p_changes->>'actif')::boolean else c.actif end,
    demarrage  = case when p_changes ? 'demarrage' then nullif(p_changes->>'demarrage', '') else c.demarrage end,
    seniorite  = case when p_changes ? 'seniorite' then p_changes->>'seniorite' else c.seniorite end,
    budget     = case when p_changes ? 'budget' then (p_changes->>'budget')::int else c.budget end
  where c.id::text = p_commercial;
end;
$$;

-- 3. Ajouter un commercial dans l'équipe d'un de SES TM (sans doublon de nom dans cette équipe).
create or replace function public.rm_ajouter_commercial(
  p_tm text, p_nom text, p_seniorite text, p_budget integer, p_demarrage text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rm  public.managers.id%type;
  v_tm  public.managers.id%type;
  v_id  public.commerciaux.id%type;
begin
  select m.id into v_rm from public.managers m where m.user_id::text = auth.uid()::text and m.role = 'RM';
  select l.tm_id into v_tm from public.rm_tms l where l.rm_id = v_rm and l.tm_id::text = p_tm;
  if v_rm is null or v_tm is null then
    raise exception 'Ce TM ne fait pas partie de tes TM.';
  end if;
  if public.nom_cle(p_nom) = '' then
    raise exception 'Le nom ne peut pas être vide.';
  end if;
  if p_seniorite not in ('M1', 'M2', 'M3+') or p_budget not in (5, 10, 15) then
    raise exception 'Niveau ou budget invalide.';
  end if;
  if exists (select 1 from public.commerciaux c
             where c.manager_id = v_tm and c.actif and public.nom_cle(c.nom) = public.nom_cle(p_nom)) then
    raise exception '% fait déjà partie de cette équipe.', trim(p_nom);
  end if;

  insert into public.commerciaux (nom, seniorite, budget, manager_id, actif, demarrage, cree_par_rm)
  values (trim(p_nom), p_seniorite, p_budget, v_tm, true, nullif(p_demarrage, ''), v_rm)
  returning id into v_id;
  return v_id::text;
end;
$$;

-- 4. Modifier un de SES TM : sa date de début (tous ses TM), et son nom (seulement un TM créé depuis le BI,
--    sans login : un TM qui a son propre compte gère lui-même son nom).
--    p_changes = {"date_debut": "Avril 2026" | null, "nom": "…"}
create or replace function public.rm_modifier_tm(p_tm text, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rm  public.managers.id%type;
  v_tm  public.managers%rowtype;
begin
  select m.id into v_rm from public.managers m where m.user_id::text = auth.uid()::text and m.role = 'RM';
  select m.* into v_tm from public.rm_tms l join public.managers m on m.id = l.tm_id
  where l.rm_id = v_rm and l.tm_id::text = p_tm;
  if v_rm is null or v_tm.id is null then
    raise exception 'Ce TM ne fait pas partie de tes TM.';
  end if;

  if p_changes ? 'nom' then
    if v_tm.cree_par_rm is distinct from v_rm or v_tm.user_id is not null then
      raise exception 'Seul un TM créé depuis ton BI, sans login, peut être renommé ici.';
    end if;
    if public.nom_cle(p_changes->>'nom') = '' then
      raise exception 'Le nom ne peut pas être vide.';
    end if;
  end if;

  update public.managers m set
    date_debut = case when p_changes ? 'date_debut' then nullif(p_changes->>'date_debut', '') else m.date_debut end,
    nom        = case when p_changes ? 'nom' then trim(p_changes->>'nom') else m.nom end
  where m.id = v_tm.id;
end;
$$;

-- 5. Retirer un TM créé depuis le BI (sans login) : il n'est plus rattaché au RM. Rien n'est supprimé (ses sales,
--    ses 1:1 et le BI restent en base) : on peut le rattacher de nouveau en SQL si besoin.
create or replace function public.rm_retirer_tm(p_tm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rm  public.managers.id%type;
begin
  select m.id into v_rm from public.managers m where m.user_id::text = auth.uid()::text and m.role = 'RM';
  if v_rm is null or not exists (
    select 1 from public.rm_tms l join public.managers m on m.id = l.tm_id
    where l.rm_id = v_rm and l.tm_id::text = p_tm and m.cree_par_rm = v_rm and m.user_id is null
  ) then
    raise exception 'Seul un TM créé depuis ton BI, sans login, peut être retiré ici.';
  end if;
  delete from public.rm_tms l where l.rm_id = v_rm and l.tm_id::text = p_tm;
end;
$$;

revoke all on function public.rm_modifier_commercial(text, jsonb) from public, anon;
revoke all on function public.rm_ajouter_commercial(text, text, text, integer, text) from public, anon;
revoke all on function public.rm_modifier_tm(text, jsonb) from public, anon;
revoke all on function public.rm_retirer_tm(text) from public, anon;
grant execute on function public.rm_modifier_commercial(text, jsonb) to authenticated;
grant execute on function public.rm_ajouter_commercial(text, text, text, integer, text) to authenticated;
grant execute on function public.rm_modifier_tm(text, jsonb) to authenticated;
grant execute on function public.rm_retirer_tm(text) to authenticated;

-- 6. La création depuis le BI (brique 5) accepte maintenant le mois de démarrage proposé pour chaque nouveau sales
--    ("demarrage": "Septembre 2026" dans chaque sales). Même fonction qu'avant, seul l'insert du commercial change.
create or replace function public.creer_equipes_bi_rm(p_equipes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rm       public.managers.id%type;
  v_tm       public.managers.id%type;
  v_com      public.commerciaux.id%type;
  v_autre    text;
  e          jsonb;
  s          jsonb;
  bilan      jsonb := jsonb_build_object(
               'tm_crees', '[]'::jsonb, 'tm_existants', 0,
               'sales_crees', '[]'::jsonb, 'sales_existants', 0, 'signales', '[]'::jsonb);
begin
  -- Seul le RM connecté peut appeler cette fonction.
  select m.id into v_rm from public.managers m where m.user_id::text = auth.uid()::text and m.role = 'RM';
  if v_rm is null then
    raise exception 'Réservé aux RM.';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_equipes, '[]'::jsonb)) loop
    v_tm := null;

    -- ——— Le TM ———
    if nullif(e->>'tm_id', '') is not null then
      -- Un TM « reconnu » doit vraiment être relié à ce RM.
      select l.tm_id into v_tm from public.rm_tms l
      where l.rm_id = v_rm and l.tm_id::text = e->>'tm_id';
      if v_tm is null then
        raise exception 'TM % : pas relié à ce RM.', e->>'tm_nom';
      end if;
      bilan := jsonb_set(bilan, '{tm_existants}', to_jsonb((bilan->>'tm_existants')::int + 1));
    else
      if public.nom_cle(e->>'tm_nom') = '' then
        raise exception 'Nom de TM vide.';
      end if;
      -- Déjà relié à ce RM sous le même nom : on le réutilise.
      select m.id into v_tm from public.rm_tms l join public.managers m on m.id = l.tm_id
      where l.rm_id = v_rm and public.nom_cle(m.nom) = public.nom_cle(e->>'tm_nom')
      limit 1;
      if v_tm is not null then
        bilan := jsonb_set(bilan, '{tm_existants}', to_jsonb((bilan->>'tm_existants')::int + 1));
      elsif exists (select 1 from public.managers m where public.nom_cle(m.nom) = public.nom_cle(e->>'tm_nom')) then
        -- Même nom ailleurs (autre région, ou un RM) : ni création, ni rattachement automatique.
        bilan := jsonb_set(bilan, '{signales}', (bilan->'signales') || jsonb_build_array(
          format('TM « %s » existe déjà hors de ta région : à rattacher à la main (non créé).', e->>'tm_nom')));
        continue; -- ses sales ne sont pas traités non plus
      else
        insert into public.managers (user_id, nom, equipe, role, cree_par_rm)
        values (null, trim(e->>'tm_nom'), coalesce(nullif(trim(e->>'region'), ''), trim(e->>'tm_nom')), 'TM', v_rm)
        returning id into v_tm;
        insert into public.rm_tms (rm_id, tm_id) values (v_rm, v_tm) on conflict do nothing;
        bilan := jsonb_set(bilan, '{tm_crees}', (bilan->'tm_crees') || to_jsonb(trim(e->>'tm_nom')));
      end if;
    end if;

    -- ——— Ses sales ———
    for s in select * from jsonb_array_elements(coalesce(e->'sales', '[]'::jsonb)) loop
      if nullif(s->>'commercial_id', '') is not null then
        -- Un sales « reconnu » doit vraiment appartenir à ce TM.
        if not exists (select 1 from public.commerciaux c where c.id::text = s->>'commercial_id' and c.manager_id = v_tm) then
          raise exception 'Sales % : n''appartient pas à ce TM.', s->>'nom';
        end if;
        bilan := jsonb_set(bilan, '{sales_existants}', to_jsonb((bilan->>'sales_existants')::int + 1));
        continue;
      end if;
      if public.nom_cle(s->>'nom') = '' then
        continue;
      end if;

      -- Déjà sous CE TM (actif ou parti) : réutilisé, jamais dupliqué, jamais réactivé.
      select c.id into v_com from public.commerciaux c
      where c.manager_id = v_tm and public.nom_cle(c.nom) = public.nom_cle(s->>'nom')
      limit 1;
      if v_com is not null then
        bilan := jsonb_set(bilan, '{sales_existants}', to_jsonb((bilan->>'sales_existants')::int + 1));
        continue;
      end if;

      -- Même nom sous UN AUTRE TM de ce RM (changement d'équipe ?) : on ne crée rien, on signale.
      select m.nom into v_autre from public.commerciaux c
      join public.rm_tms l on l.tm_id = c.manager_id and l.rm_id = v_rm
      join public.managers m on m.id = c.manager_id
      where c.manager_id <> v_tm and c.actif and public.nom_cle(c.nom) = public.nom_cle(s->>'nom')
      limit 1;
      if v_autre is not null then
        bilan := jsonb_set(bilan, '{signales}', (bilan->'signales') || jsonb_build_array(
          format('« %s » est déjà dans l''équipe de %s : non créé (à vérifier).', s->>'nom', v_autre)));
        continue;
      end if;

      insert into public.commerciaux (nom, seniorite, budget, manager_id, actif, cree_par_rm, demarrage)
      values (
        trim(s->>'nom'),
        case when s->>'seniorite' in ('M1', 'M2', 'M3+') then s->>'seniorite' else 'M3+' end,
        case when (s->>'budget') in ('5', '10', '15') then (s->>'budget')::int else 15 end,
        v_tm, true, v_rm,
        -- Mois de démarrage proposé à la création (M1 / M2) ; un M3+ n''en a pas besoin (déjà senior).
        case when s->>'seniorite' in ('M1', 'M2') then nullif(s->>'demarrage', '') end
      );
      bilan := jsonb_set(bilan, '{sales_crees}', (bilan->'sales_crees') || to_jsonb(trim(s->>'nom')));
    end loop;
  end loop;

  return bilan;
end;
$$;
revoke all on function public.creer_equipes_bi_rm(jsonb) from public, anon;
grant execute on function public.creer_equipes_bi_rm(jsonb) to authenticated;

commit;

-- =====================================================================
-- POUR ANNULER (à lancer seul) — ne supprime aucune donnée :
-- begin;
-- drop function if exists public.rm_modifier_commercial;
-- drop function if exists public.rm_ajouter_commercial;
-- drop function if exists public.rm_modifier_tm;
-- drop function if exists public.rm_retirer_tm;
-- alter table public.managers drop column if exists date_debut;
-- -- (puis relancer la partie « creer_equipes_bi_rm » de db/auto-creation-tm.sql pour revenir à la version sans démarrage)
-- commit;
-- =====================================================================
