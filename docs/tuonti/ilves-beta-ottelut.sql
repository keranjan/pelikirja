-- 7 ottelua joukkueelle Ilves Beta
-- Voidaan ajaa turvallisesti uudelleen: jo tuodut ottelut päivitetään, ei kahdenneta.
do $pelikirja$
declare
  paivitetty int;
begin
update public.pelikirja
set data = jsonb_set(
      data,
      '{matches}',
      (
        select coalesce(jsonb_agg(rivi order by rivi->>'date', rivi->>'time'), '[]'::jsonb)
        from (
          -- Jo tallennetut ottelut: vain joukkuetieto päivitetään.
          select case
                   when uusi.m is null then vanha.e
                   else vanha.e || jsonb_build_object('team', uusi.m->>'team')
                 end as rivi
          from jsonb_array_elements(coalesce(data->'matches', '[]'::jsonb)) as vanha(e)
          left join jsonb_array_elements('[{"id":"tp398240","date":"2026-08-28","time":"19:30","opponent":"Akaa YJ","team":"Ilves Beta","home":false,"venue":"Pallokenttä TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398246","date":"2026-09-06","time":"12:00","opponent":"FC Inter","team":"Ilves Beta","home":true,"venue":"Rantaperkiö TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398251","date":"2026-09-11","time":"19:15","opponent":"FC Jazz","team":"Ilves Beta","home":false,"venue":"Herralahti TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398257","date":"2026-09-20","time":"18:00","opponent":"KaaPo","team":"Ilves Beta","home":false,"venue":"Reunakivi-areena TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398265","date":"2026-09-26","time":"14:15","opponent":"ÅIFK/svart","team":"Ilves Beta","home":true,"venue":"Vuores TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398274","date":"2026-09-29","time":"18:30","opponent":"TuKV","team":"Ilves Beta","home":false,"venue":"Impivaara Areena A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398262","date":"2026-10-06","time":"20:00","opponent":"MuSa/Black","team":"Ilves Beta","home":true,"venue":"Vuores TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null}]'::jsonb) as uusi(m)
                 on uusi.m->>'id' = vanha.e->>'id'
          union all
          -- Uudet ottelut lisätään sellaisenaan.
          select uusi.m
          from jsonb_array_elements('[{"id":"tp398240","date":"2026-08-28","time":"19:30","opponent":"Akaa YJ","team":"Ilves Beta","home":false,"venue":"Pallokenttä TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398246","date":"2026-09-06","time":"12:00","opponent":"FC Inter","team":"Ilves Beta","home":true,"venue":"Rantaperkiö TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398251","date":"2026-09-11","time":"19:15","opponent":"FC Jazz","team":"Ilves Beta","home":false,"venue":"Herralahti TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398257","date":"2026-09-20","time":"18:00","opponent":"KaaPo","team":"Ilves Beta","home":false,"venue":"Reunakivi-areena TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398265","date":"2026-09-26","time":"14:15","opponent":"ÅIFK/svart","team":"Ilves Beta","home":true,"venue":"Vuores TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398274","date":"2026-09-29","time":"18:30","opponent":"TuKV","team":"Ilves Beta","home":false,"venue":"Impivaara Areena A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp398262","date":"2026-10-06","time":"20:00","opponent":"MuSa/Black","team":"Ilves Beta","home":true,"venue":"Vuores TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null}]'::jsonb) as uusi(m)
          where not exists (
            select 1
            from jsonb_array_elements(coalesce(data->'matches', '[]'::jsonb)) as v(e)
            where v.e->>'id' = uusi.m->>'id'
          )
        ) s
      )
    ),
    rev = rev + 1,
    updated_at = now()
where user_id = '66fa941c-bf29-45d9-9bcf-e736ca6433ae';

get diagnostics paivitetty = row_count;
if paivitetty = 0 then
  raise exception 'Yhtaan rivia ei paivitetty: tarkista kayttajatunnus (SQL-editorissa auth.uid() on NULL).';
end if;
raise notice 'Paivitetty % ottelua riville.', 7;
end
$pelikirja$;
