# Valmiiksi muunnetut otteluohjelmat

Tiedostot on tuotettu Torneopalin sarjaohjelmasta komennolla

```bash
node tools/import-torneopal.mjs otteluohjelma.html --team "Ilves Beta" --sql
```

| Tiedosto | Sisältö |
| --- | --- |
| `ilves-beta-ottelut.json` | Ilves Betan ottelut sovelluksen muodossa |
| `ilves-beta-ottelut.sql` | sama Supabase-riville ajettavana SQL:nä |
| `ilves-keltainen-ottelut.json` | Ilves Keltaisen ottelut |
| `ilves-keltainen-ottelut.sql` | sama SQL:nä |

Jokaisessa ottelussa on `team`-kenttä, joka kertoo kumman joukkueen ottelusta on
kyse. Sovellus näyttää sen ottelukortin merkkinä ja tarjoaa Ottelut-välilehdellä
joukkuesuodattimen, kun otteluita on useammalle joukkueelle.

SQL-lauseet voi ajaa Supabasen SQL-editorissa myös useamman kerran: ottelut
tunnistetaan Torneopalin ottelunumerosta (`tp<numero>`), joten jo tuotujen
otteluiden kokoonpanot ja tulokset säilyvät – vain joukkuetieto päivittyy – ja
uudet ottelut lisätään perään. Muut ottelut jäävät koskemattomiksi.
