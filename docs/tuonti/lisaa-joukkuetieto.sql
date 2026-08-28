-- Lisää joukkuetiedon jo tuotuihin otteluihin. Muu data säilyy koskemattomana.
do $pelikirja$
declare
  paivitetty int;
begin
  update public.pelikirja
  set data = jsonb_set(data, '{matches}', (
        select coalesce(jsonb_agg(
                 case
                   when m->>'id' in ('tp398240','tp398246','tp398251','tp398257',
                                     'tp398262','tp398265','tp398274')
                     then m || '{"team":"Ilves Beta"}'::jsonb
                   when m->>'id' in ('tp405863','tp405891','tp405902','tp405904','tp405912')
                     then m || '{"team":"Ilves Keltainen"}'::jsonb
                   else m
                 end
                 order by m->>'date', m->>'time'), '[]'::jsonb)
        from jsonb_array_elements(coalesce(data->'matches', '[]'::jsonb)) as t(m))),
      rev = rev + 1,
      updated_at = now()
  where user_id = '66fa941c-bf29-45d9-9bcf-e736ca6433ae';

  get diagnostics paivitetty = row_count;
  if paivitetty = 0 then
    raise exception 'Yhtaan rivia ei paivitetty: tarkista kayttajatunnus.';
  end if;
  raise notice 'Rivi paivitetty.';
end
$pelikirja$;
