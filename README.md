# Pelikirja

Mobiilisovellus jalkapallojoukkueen valmentajalle: suunnittele **kokoonpanot ja pelipaikat**,
lisää **tulevat ottelut ja tapahtumat** sekä liitä otteluihin **kokoonpano ja tulos**.

Sovellus on asennettava web-sovellus (PWA): sen voi lisätä puhelimen kotinäytölle, se toimii
ilman verkkoyhteyttä ja kaikki tiedot tallentuvat vain omaan laitteeseen.

## Käyttöliittymä

Vaalea ottelupäivä-ilme, joka erottuu myös auringossa – ja tumma vastinpari
iltapeleihin (Asetukset → Ulkoasu: järjestelmä, vaalea tai tumma).
Otsikot ja numerot Archivo, leipäteksti Instrument Sans; fontit on upotettu
sovellukseen, joten ulkoasu on sama myös ilman verkkoyhteyttä.

Sovellus avautuu **Ottelupäivä**-etusivulle, joka näyttää seuraavan ottelun
isona: lähtölaskenta, kokoonpanon täyttöaste pikkukenttänä, viimeisin tulos
ja kauden luvut. Muut näkymät ovat omina välilehtinään.

## Ominaisuudet

**Ottelupäivä (etusivu)**
- Seuraava ottelu isona: vastustaja, paikka, kellonaika ja lähtölaskenta
- Kokoonpanon tila mittarina ja pikkukenttänä yhdellä silmäyksellä
- Viimeisin tulos maalintekijöineen ja videolinkkeineen
- Kauden luvut: ottelut, voitot–tasapelit–tappiot ja maalit

**Pelaajat**
- Pelaajakortti: nimi, pelinumero, vahvempi jalka, muistiinpanot
- Pelipaikat (MV, LP, KP, AKK, KK, YKK, LH, KH) – sovellus ehdottaa niiden perusteella sopivia pelaajia
- Merkintä "ei käytettävissä" pidempiaikaisille poissaoloille

**Kokoonpanot ja pelipaikat**
- Kenttäkuva, jossa pelaajat asetellaan paikoilleen napauttamalla
- 22 valmista pelisysteemiä – pelaajat säilyvät systeemiä vaihdettaessa:
  11 vs 11 (4-4-2, 4-3-3, 4-2-3-1, 4-5-1, 3-5-2, 3-4-3, 5-3-2),
  9 vs 9 (3-3-2, 3-2-3, 2-3-3), 8 vs 8 (2-3-2, 2-4-1, 3-2-2, 3-3-1, 2-2-3, 3-1-3),
  7 vs 7 (2-3-1, 3-2-1, 2-1-2-1) ja 5 vs 5 (1-2-1, 2-1-1, 1-1-2)
- Automaattitäyttö, joka sijoittaa pelaajat heidän pelipaikkojensa mukaan
- Vaihtopenkki ja ottelukohtaiset poissaolot
- Kokoonpanopohjat: tallenna vakioasetelmat ja hae ne otteluun yhdellä napautuksella
- Kokoonpanon jakaminen tekstinä esimerkiksi joukkueen WhatsApp-ryhmään

**Taktiikkataulu**
- Sama kenttäkuva vaihtuu Taktiikka-tilaan, jossa voi piirtää sormella ottelun aikana
- Koko ruudun taulu, jossa kenttä täyttää puhelimen näytön – toimii sekä pysty- että vaaka-asennossa
- Neljä työkalua: syöttö (viiva), kuljetus (katkoviiva), laukaus (paksu nuoli) ja siirto
- Neljä väriä: musta, valkoinen, punainen ja keltainen; jokaisessa vedossa on
  kevyt reunus, joten viivat erottuvat sekä vaalealta että tummalta nurmelta
- Piirtotyökaluilla veto saa alkaa myös pelaajan päältä: kosketus menee pelaajamerkkien läpi
- Siirto-työkalulla pelaajia raahataan kentällä; "Palauta paikat" palauttaa pelisysteemin mukaiset paikat
- Kumoa viimeisin veto tai tyhjennä koko piirros
- Piirrokset ja siirretyt paikat tallentuvat ottelun tai kokoonpanopohjan mukana ja
  näkyvät myös kokoonpanotilassa

**Ottelut ja tapahtumat**
- Ottelut, turnaukset ja harjoituspelit: päivä, aika, vastustaja, paikka, koti/vieras, muistiinpanot
- Tulevat tapahtumat aikajärjestyksessä, mukana lähtölaskenta ja kokoonpanon täyttöaste
- Jokaisella ottelulla oma kokoonpanonsa
- Tulos: maalit puolittain, maalintekijät, syöttäjät ja maaliminuutit
- Videolinkki otteluun (Veo, YouTube, Vimeo, Spiideo, Hudl tai mikä tahansa https-osoite):
  tallenne avautuu Tulos-välilehdeltä yhdellä napautuksella palvelun omaan sovellukseen
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
css/fonts.css           upotetut kirjasimet (Archivo, Instrument Sans)
css/styles.css          tyylit ja väriteemat
js/icons.js             viivakuvakkeet
js/tactics.js           taktiikkapiirrosten työkalut ja polut
js/app.js               reititys ja näkymien piirto
js/store.js             tila ja tallennus (localStorage)
js/formations.js        pelisysteemit ja pelipaikat
js/ui.js                UI-apurit (elementit, alapaneelit, päivämäärät)
js/views/               näkymät: ottelupäivä, ottelut, ottelu, kokoonpanot, pelaajat,
                        kenttä, tilastot, asetukset
tools/build-single.mjs  kokoaa yhden tiedoston version
tests/smoke.mjs         päävirran savutesti
```
