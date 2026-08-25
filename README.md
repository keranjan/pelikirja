# Pelikirja

Mobiilisovellus jalkapallojoukkueen valmentajalle: suunnittele **kokoonpanot ja pelipaikat**,
lisää **tulevat ottelut ja tapahtumat** sekä liitä otteluihin **kokoonpano ja tulos**.

Sovellus on asennettava web-sovellus (PWA): sen voi lisätä puhelimen kotinäytölle, se toimii
ilman verkkoyhteyttä ja kaikki tiedot tallentuvat vain omaan laitteeseen.

## Ominaisuudet

**Pelaajat**
- Pelaajakortti: nimi, pelinumero, vahvempi jalka, muistiinpanot
- Pelipaikat (MV, LP, KP, DKK, KK, HKK, LH, KH) – sovellus ehdottaa niiden perusteella sopivia pelaajia
- Merkintä "ei käytettävissä" pidempiaikaisille poissaoloille

**Kokoonpanot ja pelipaikat**
- Kenttäkuva, jossa pelaajat asetellaan paikoilleen napauttamalla
- 16 valmista pelisysteemiä: 11 vs 11 (4-4-2, 4-3-3, 4-2-3-1, 4-5-1, 3-5-2, 3-4-3, 5-3-2),
  9 vs 9, 7 vs 7 ja 5 vs 5 – pelaajat säilyvät systeemiä vaihdettaessa
- Automaattitäyttö, joka sijoittaa pelaajat heidän pelipaikkojensa mukaan
- Vaihtopenkki ja ottelukohtaiset poissaolot
- Kokoonpanopohjat: tallenna vakioasetelmat ja hae ne otteluun yhdellä napautuksella
- Kokoonpanon jakaminen tekstinä esimerkiksi joukkueen WhatsApp-ryhmään

**Ottelut ja tapahtumat**
- Ottelut, turnaukset ja harjoituspelit: päivä, aika, vastustaja, paikka, koti/vieras, muistiinpanot
- Tulevat tapahtumat aikajärjestyksessä, mukana lähtölaskenta ja kokoonpanon täyttöaste
- Jokaisella ottelulla oma kokoonpanonsa
- Tulos: maalit puolittain, maalintekijät, syöttäjät ja maaliminuutit
- Pelatut ottelut omalla välilehdellään voitto/tasapeli/tappio-merkinnöin

**Tilastot**
- Joukkue: ottelut, voitot, tasapelit, tappiot, maalit ja pisteet
- Pelaajat: avauskokoonpanot, vaihtopenkki, maalit ja syötöt

**Tiedot**
- Kaikki tallentuu laitteen selaimeen (localStorage), ei tilejä eikä palvelinta
- Varmuuskopion vienti ja tuonti JSON-tiedostona (Asetukset-välilehti)

## Käyttöönotto puhelimessa

Sovellus tarvitsee HTTPS-osoitteen (tai `localhost`), jotta sen voi asentaa kotinäytölle.

**GitHub Pages (helpoin)**

1. Repositoryn asetukset → *Pages*
2. *Source*: `Deploy from a branch`, haara `main` (tai tämä kehityshaara), kansio `/ (root)`
3. Avaa julkaistu osoite puhelimen selaimessa
4. iPhone: *Jaa* → *Lisää Koti-valikkoon*. Android: valikko → *Asenna sovellus*

Sovellus toimii tämän jälkeen myös lentokonetilassa – kentän laidalla ei tarvita verkkoa.

## Yhden tiedoston versio

`dist/pelikirja.html` on koko sovellus yhtenä tiedostona: sen voi avata suoraan puhelimessa
tai laittaa mihin tahansa web-hotelliin ilman muita tiedostoja. Rakennus: `npm run build`.

## Kehitys

```bash
npm install      # vain testejä varten (Playwright)
npm start        # http://localhost:8080
npm test         # selainpohjainen savutesti, kuvakaappaukset .screenshots/-kansioon
npm run build    # dist/pelikirja.html (yksi tiedosto)
```

Sovelluksessa ei ole käännösvaihetta: `index.html` ja ES-moduulit toimivat sellaisenaan.

```
index.html              käyttöliittymän runko
manifest.webmanifest    PWA-määrittely
sw.js                   service worker (offline-välimuisti)
css/styles.css          tyylit
js/app.js               reititys ja näkymien piirto
js/store.js             tila ja tallennus (localStorage)
js/formations.js        pelisysteemit ja pelipaikat
js/ui.js                UI-apurit (elementit, alapaneelit, päivämäärät)
js/views/               näkymät: ottelut, ottelu, kokoonpanot, pelaajat, kenttä, tilastot, asetukset
tools/build-single.mjs  kokoaa yhden tiedoston version
tests/smoke.mjs         päävirran savutesti
```
