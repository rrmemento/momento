-- =====================================================================
-- MOMENTO · Import du BI RM ADDITIF — une équipe à la fois (1 TM + ses sales)
-- À coller dans Supabase > SQL Editor. Remplace seulement la fonction remplacer_bi_rm (même nom, mêmes paramètres :
-- l'app n'a rien à changer pour l'appeler). Tout ou rien (begin / commit), relançable. Aucune donnée modifiée en lançant
-- ce script : seul le comportement des prochains imports change.
--
-- AVANT : chaque import d'un mois EFFAÇAIT tout le mois du RM (toutes les équipes), puis réinsérait.
-- APRÈS : un import ne remplace QUE les équipes qu'il contient (par TM) ; les autres équipes du même mois sont GARDÉES.
--   - lignes « tm » et « sales » : on efface seulement celles des TM présents dans le nouvel import ;
--   - ligne Région / total : remplacée seulement si le nouvel import en contient une (jamais en double) ;
--   - les numéros de ligne (rang) du nouvel import sont décalés après ceux déjà gardés : chaque import numérote ses
--     lignes à partir de 1, et le couple (RM, mois, rang) doit rester unique.
-- =====================================================================
begin;

create or replace function public.remplacer_bi_rm(p_mois text, p_lignes jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rm        public.managers.id%type;
  v_nb        integer;
  v_decalage  integer;
  v_a_region  boolean;
begin
  select m.id into v_rm from public.managers m where m.user_id::text = auth.uid()::text and m.role = 'RM';
  if v_rm is null then
    raise exception 'Import réservé aux RM.';
  end if;

  -- 1. Les équipes de CET import : on remplace seulement leurs lignes (tm et sales), par TM.
  delete from public.bi_rm_lignes b
  where b.rm_id = v_rm
    and b.mois = p_mois
    and b.tm_id is not null
    and b.tm_id::text in (
      select distinct l->>'tm_id' from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l
      where nullif(l->>'tm_id', '') is not null
    );

  -- 2. La ligne Région / total : remplacée seulement si cet import en apporte une (pas de doublon, pas de perte).
  v_a_region := exists (
    select 1 from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l where l->>'niveau' = 'region'
  );
  if v_a_region then
    delete from public.bi_rm_lignes b where b.rm_id = v_rm and b.mois = p_mois and b.niveau = 'region';
  end if;

  -- 3. Les nouvelles lignes, numérotées après celles qui restent (les autres équipes gardées).
  select coalesce(max(b.rang), 0) into v_decalage
  from public.bi_rm_lignes b where b.rm_id = v_rm and b.mois = p_mois;

  insert into public.bi_rm_lignes (rm_id, mois, rang, niveau, tm_id, commercial_id, nom, donnees)
  select v_rm, p_mois, v_decalage + r.rang, r.niveau, r.tm_id, r.commercial_id, r.nom, coalesce(r.donnees, '{}'::jsonb)
  from jsonb_populate_recordset(null::public.bi_rm_lignes, p_lignes) r;

  get diagnostics v_nb = row_count;
  return v_nb; -- nombre de lignes enregistrées par CET import
end;
$$;
revoke all on function public.remplacer_bi_rm(text, jsonb) from public, anon;
grant execute on function public.remplacer_bi_rm(text, jsonb) to authenticated;

commit;

-- =====================================================================
-- VÉRIFICATION (lecture seule) : les équipes importées pour un mois, avec leur nombre de sales.
-- select m.nom as tm, count(*) filter (where b.niveau = 'sales') as sales, min(b.importe_le) as importe_le
-- from public.bi_rm_lignes b join public.managers m on m.id = b.tm_id
-- where b.mois = 'Septembre 2026' group by m.nom order by m.nom;
--
-- POUR ANNULER (revenir à l'ancien comportement « un import remplace tout le mois ») : relancer la partie
-- « remplacer_bi_rm » de db/import-bi-rm.sql.
-- =====================================================================
