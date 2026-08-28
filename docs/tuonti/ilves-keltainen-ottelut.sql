-- 5 ottelua joukkueelle Ilves Keltainen
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
          left join jsonb_array_elements('[{"id":"tp405912","date":"2026-08-31","time":"18:00","opponent":"RiPS/Sininen","team":"Ilves Keltainen","home":false,"venue":"Keskuskenttä TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405902","date":"2026-09-13","time":"13:00","opponent":"Ilves/P2015 Beta","team":"Ilves Keltainen","home":true,"venue":"Vuores TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405891","date":"2026-09-21","time":"20:00","opponent":"Ilves Vihreä","team":"Ilves Keltainen","home":false,"venue":"Vuores TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405904","date":"2026-10-04","time":"12:00","opponent":"JanPa","team":"Ilves Keltainen","home":true,"venue":"Kaukajärvi TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405863","date":"2026-10-11","time":"12:00","opponent":"HJS/sinivalkoinen","team":"Ilves Keltainen","home":false,"venue":"Pulleri TN 1 A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null}]'::jsonb) as uusi(m)
                 on uusi.m->>'id' = vanha.e->>'id'
          union all
          -- Uudet ottelut lisätään sellaisenaan.
          select uusi.m
          from jsonb_array_elements('[{"id":"tp405912","date":"2026-08-31","time":"18:00","opponent":"RiPS/Sininen","team":"Ilves Keltainen","home":false,"venue":"Keskuskenttä TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405902","date":"2026-09-13","time":"13:00","opponent":"Ilves/P2015 Beta","team":"Ilves Keltainen","home":true,"venue":"Vuores TN A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405891","date":"2026-09-21","time":"20:00","opponent":"Ilves Vihreä","team":"Ilves Keltainen","home":false,"venue":"Vuores TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405904","date":"2026-10-04","time":"12:00","opponent":"JanPa","team":"Ilves Keltainen","home":true,"venue":"Kaukajärvi TN B","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null},{"id":"tp405863","date":"2026-10-11","time":"12:00","opponent":"HJS/sinivalkoinen","team":"Ilves Keltainen","home":false,"venue":"Pulleri TN 1 A","type":"ottelu","videoUrl":"","notes":"","lineup":{"formation":"8-2-3-2","slots":[null,null,null,null,null,null,null,null],"bench":[],"positions":{},"drawings":[]},"result":null}]'::jsonb) as uusi(m)
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
raise notice 'Paivitetty % ottelua riville.', 5;
end
$pelikirja$;
