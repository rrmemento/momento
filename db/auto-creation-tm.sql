-- =====================================================================
-- MOMENTO · Brique 5 — Auto-création des TM et de leurs sales à l'import du BI RM
-- À coller dans Supabase > SQL Editor, APRÈS db/acces-rm.sql et db/import-bi-rm.sql.
-- Tout ou rien (begin / commit), relançable. Ne modifie AUCUNE donnée existante :
-- Roméo, Jean, Quentin et leurs commerciaux ne sont ni modifiés ni dupliqués.
-- =====================================================================
begin;

-- 1. Un TM peut exister SANS login : « personne managée », prête à recevoir un compte plus tard
--    (il suffira alors de remplir son user_id, sans rien recréer).
--    Sans effet sur les comptes actuels. Les règles existantes « user_id = auth.uid() » ne voient jamais
--    une ligne sans login : un TM sans login n'est visible que de son RM (règle « RM lit ses TM »).
alter table public.managers alter column user_id drop not null;

-- 2. Traçabilité : qui a créé cette fiche (vide = créée à la main, comme aujourd'hui).
--    Sert à l'affichage (« créé depuis le BI ») et à l'annulation. Même type que managers.id.
do $$
declare
  t_manager text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_manager
  from pg_attribute a where a.attrelid = 'public.managers'::regclass and a.attname = 'id';

  execute format('alter table public.managers add column if not exists cree_par_rm %s references public.managers (id) on delete set null', t_manager);
  execute format('alter table public.commerciaux add column if not exists cree_par_rm %s references public.managers (id) on delete set null', t_manager);
end $$;

-- 3. « Kélly  HOCHET » → « kelly hochet » : la clé de comparaison des noms (même règle que l'app : sans accents,
--    minuscules, ponctuation remplacée par des espaces). Sert à ne JAMAIS créer un doublon.
create or replace function public.nom_cle(p_nom text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(translate(coalesce(p_nom, ''),
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- 4. Créer / rattacher les TM et leurs sales, APRÈS confirmation du RM dans l'app.
--    Appelable seulement par un RM connecté (sinon erreur). security definer : elle écrit dans managers,
--    commerciaux et rm_tms, que le RM ne peut pas modifier directement (aucune règle d'écriture pour lui).
--
--    p_equipes = [ { "tm_id": "<id>" | null, "tm_nom": "Paul Martin", "region": "Sud Est" (lue dans le BI, facultatif),
--                    "sales": [ { "commercial_id": "<id>" | null, "nom": "Léo Dupont", "seniorite": "M3+", "budget": 15 } ] } ]
--    tm_id / commercial_id renseignés = déjà existants (reconnus à l'import) ; null = à créer.
--
--    Règles anti-doublon (vérifiées ICI, même si l'app s'est trompée) :
--    - TM : on réutilise d'abord un TM déjà relié à ce RM portant le même nom (nom_cle). Si un manager de même
--      nom existe mais N'EST PAS relié à ce RM (autre région, ou un RM), on ne crée rien et on ne le relie pas :
--      il est signalé dans le résultat, à rattacher à la main.
--    - Sales : on réutilise un commercial de même nom sous CE TM (actif ou parti ; un parti n'est pas réactivé).
--      Si ce nom existe déjà sous UN AUTRE TM du RM (changement d'équipe ?), on ne crée rien : signalé.
--    Renvoie le bilan : créés, réutilisés, signalés.
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

      insert into public.commerciaux (nom, seniorite, budget, manager_id, actif, cree_par_rm)
      values (
        trim(s->>'nom'),
        case when s->>'seniorite' in ('M1', 'M2', 'M3+') then s->>'seniorite' else 'M3+' end,
        case when (s->>'budget') in ('5', '10', '15') then (s->>'budget')::int else 15 end,
        v_tm, true, v_rm
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
-- VÉRIFICATION (lecture seule, à lancer après) : les TM du RM, avec ou sans login, et leurs sales.
-- select m.nom as tm, (m.user_id is not null) as a_un_login, (m.cree_par_rm is not null) as cree_depuis_bi,
--        count(c.id) filter (where c.actif) as sales_actifs
-- from public.rm_tms l join public.managers m on m.id = l.tm_id
-- left join public.commerciaux c on c.manager_id = m.id
-- group by m.nom, m.user_id, m.cree_par_rm order by m.nom;
--
-- DONNER UN LOGIN À UN TM CRÉÉ DEPUIS LE BI (plus tard, quand son compte existe dans Supabase Auth) :
-- update public.managers set user_id = (select id from auth.users where email = 'tm@exemple.fr')
-- where id = '<id du TM>' and user_id is null;
--
-- POUR TOUT ANNULER (à lancer seul) — ne touche qu'à ce que l'import a créé (cree_par_rm renseigné).
-- ATTENTION : supprime aussi les 1:1 et chiffres éventuellement saisis depuis pour ces sales / TM.
-- begin;
-- delete from public.commerciaux where cree_par_rm is not null;
-- delete from public.managers where cree_par_rm is not null and user_id is null;  -- rm_tms suit (cascade)
-- drop function if exists public.creer_equipes_bi_rm;
-- drop function if exists public.nom_cle;
-- alter table public.commerciaux drop column if exists cree_par_rm;
-- alter table public.managers drop column if exists cree_par_rm;
-- -- (user_id reste facultatif : le remettre obligatoire échouerait s'il reste des TM sans login)
-- commit;
-- =====================================================================
