-- =====================================================================
-- MOMENTO · Déclarer le RM bapgui@flatpay.fr et le relier à tous les TM
-- À coller dans Supabase > SQL Editor, APRÈS db/acces-rm.sql (déjà lancé).
-- Tout ou rien (begin / commit) et relançable sans risque : rien n'est créé en double.
-- Aucun TM existant n'est modifié : on lit seulement leur id pour créer les liens.
-- =====================================================================
begin;

-- 0. Garde-fous : on s'arrête (et rien n'est appliqué) si…
do $$
declare
  compte_id text;
  mon_manager_id text;
begin
  select u.id::text into compte_id from auth.users u where lower(u.email) = lower('bapgui@flatpay.fr');
  -- … le compte de connexion n'existe pas ;
  if compte_id is null then
    raise exception 'Aucun compte de connexion pour bapgui@flatpay.fr dans Supabase Auth.';
  end if;
  -- … ou si ce compte est déjà le manager d'une équipe (le passer RM lui ferait perdre la vue de ses commerciaux).
  select m.id::text into mon_manager_id from public.managers m where m.user_id::text = compte_id;
  if mon_manager_id is not null and exists (
    select 1 from public.commerciaux c where c.manager_id::text = mon_manager_id
  ) then
    raise exception 'bapgui@flatpay.fr gère déjà des commerciaux : on ne le passe pas RM automatiquement.';
  end if;
end $$;

-- 1. Créer la fiche manager du RM si elle n'existe pas encore (nom « RM », équipe « Régional »).
insert into public.managers (user_id, nom, equipe, role)
select u.id, 'RM', 'Régional', 'RM'
from auth.users u
where lower(u.email) = lower('bapgui@flatpay.fr')
  and not exists (select 1 from public.managers m where m.user_id::text = u.id::text);

-- 2. Mettre le rôle RM sur la fiche de ce compte (utile si elle existait déjà).
update public.managers m
set role = 'RM'
from auth.users u
where lower(u.email) = lower('bapgui@flatpay.fr')
  and m.user_id::text = u.id::text
  and m.role <> 'RM';

-- 3. Relier ce RM à tous les managers de rôle TM (lui-même exclu). Déjà relié = ignoré.
insert into public.rm_tms (rm_id, tm_id)
select rm.id, tm.id
from public.managers rm
join auth.users u on rm.user_id::text = u.id::text and lower(u.email) = lower('bapgui@flatpay.fr')
join public.managers tm on tm.role = 'TM' and tm.id <> rm.id
on conflict do nothing;

commit;

-- 4. Vérification (lecture seule) : le RM et les TM qui lui sont reliés.
select rm.nom as rm, rm.role, tm.nom as tm, tm.equipe as equipe_du_tm
from public.managers rm
join auth.users u on rm.user_id::text = u.id::text and lower(u.email) = lower('bapgui@flatpay.fr')
left join public.rm_tms l on l.rm_id = rm.id
left join public.managers tm on tm.id = l.tm_id
order by tm.nom;

-- =====================================================================
-- POUR TOUT ANNULER (à lancer seul, si besoin) — les TM ne sont pas touchés :
--
-- begin;
-- -- a) supprimer les liens de ce RM vers ses TM
-- delete from public.rm_tms
-- where rm_id in (
--   select m.id from public.managers m
--   join auth.users u on m.user_id::text = u.id::text
--   where lower(u.email) = lower('bapgui@flatpay.fr')
-- );
-- -- b) supprimer la fiche manager créée par ce script (nom « RM », équipe « Régional »)
-- delete from public.managers m
-- using auth.users u
-- where m.user_id::text = u.id::text and lower(u.email) = lower('bapgui@flatpay.fr')
--   and m.nom = 'RM' and m.equipe = 'Régional';
-- -- c) si la fiche existait AVANT ce script (donc pas supprimée en b), la repasser TM
-- update public.managers m
-- set role = 'TM'
-- from auth.users u
-- where m.user_id::text = u.id::text and lower(u.email) = lower('bapgui@flatpay.fr');
-- commit;
-- =====================================================================
