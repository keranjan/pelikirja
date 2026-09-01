// Kolmen version yhdistäminen: perusta (viimeksi synkronoitu), tämä laite ja pilvi.
// Näin kahdella laitteella tehdyt muutokset säilyvät molemmat, kunhan ne
// koskevat eri pelaajia, otteluita tai kokoonpanoja.

/** Vakaa esitysmuoto vertailua varten: avainten järjestys ei vaikuta. */
export function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

/** Oletusnimi, jota ei ole vielä muutettu. Sama arvo kuin tyhjässä tilassa. */
export const DEFAULT_TEAM_NAME = 'Oma joukkue';

const byId = (list = []) => new Map(list.map((item) => [item.id, item]));

/**
 * Yhdistää yhden listan (pelaajat, ottelut tai kokoonpanot).
 * Palauttaa myös ristiriitojen määrän: kohteet, joita on muokattu
 * molemmilla puolilla – niistä säilytetään tämän laitteen versio.
 */
function mergeList(baseList, localList, remoteList) {
  // Jos toinen puoli ei tunne listaa lainkaan (esimerkiksi vanhempi versio,
  // joka ei vielä tallentanut valmentajia), sitä ei tulkita poistoiksi.
  if (!Array.isArray(remoteList)) return { list: [...(localList || [])], conflicts: 0 };
  if (!Array.isArray(localList)) return { list: [...remoteList], conflicts: 0 };

  const base = byId(baseList);
  const local = byId(localList);
  const remote = byId(remoteList);
  const ids = new Set([...local.keys(), ...remote.keys()]);

  const result = [];
  let conflicts = 0;

  for (const id of ids) {
    const b = base.get(id);
    const l = local.get(id);
    const r = remote.get(id);

    if (l && r) {
      const localChanged = !b || stable(l) !== stable(b);
      const remoteChanged = !b || stable(r) !== stable(b);
      if (localChanged && remoteChanged && stable(l) !== stable(r)) {
        conflicts++;
        result.push(l);                 // tämän laitteen muokkaus voittaa
      } else {
        result.push(localChanged ? l : r);
      }
      continue;
    }

    // Kohde puuttuu toiselta puolelta: poistettu vai juuri lisätty?
    const only = l || r;
    const missingSide = l ? 'remote' : 'local';
    if (!b) {
      result.push(only);                // uusi kohde, ei ollut vielä synkassa
      continue;
    }
    const changedOnKeptSide = stable(only) !== stable(b);
    if (changedOnKeptSide) {
      // Toinen poisti, toinen muokkasi – muokkaus säilytetään, jottei työ katoa.
      conflicts++;
      result.push(only);
    }
    // muuten: poisto hyväksytään (kohdetta ei lisätä tulokseen)
    void missingSide;
  }

  return { list: result, conflicts };
}

/** Järjestää ottelut ja pelaajat vakaasti, jotta vertailu ei heilu turhaan. */
const sortById = (list) => [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)));

/**
 * @returns {{ state: object, conflicts: number, changed: boolean }}
 */
export function mergeStates(base, local, remote) {
  const b = base || { players: [], matches: [], lineups: [], team: {} };
  let conflicts = 0;

  const players = mergeList(b.players, local.players, remote.players);
  const staff = mergeList(b.staff, local.staff, remote.staff);
  const matches = mergeList(b.matches, local.matches, remote.matches);
  const lineups = mergeList(b.lineups, local.lineups, remote.lineups);
  conflicts += players.conflicts + staff.conflicts + matches.conflicts + lineups.conflicts;

  // Uudella laitteella, jolla ei ole omaa dataa eikä omaa joukkueen nimeä,
  // otetaan pilven tiedot sellaisenaan – muuten laitteen oletusnimi
  // ylikirjoittaisi joukkueen nimen. Jos nimi on jo annettu, se on
  // käyttäjän tietoinen valinta ja käsitellään normaalina muutoksena.
  const localIsFresh = !(local.players || []).length
    && !(local.staff || []).length
    && !(local.matches || []).length
    && !(local.lineups || []).length
    && (!local.team?.name || local.team.name === DEFAULT_TEAM_NAME);

  // Joukkueen tiedot ovat yksi kokonaisuus: uusin muutos voittaa.
  const teamBase = stable(withoutTheme(b.team || {}));
  const teamLocal = stable(withoutTheme(local.team || {}));
  const teamRemote = stable(withoutTheme(remote.team || {}));
  let team = local.team;
  if (localIsFresh && remote.team) {
    team = { ...remote.team };
  } else if (teamLocal === teamBase && teamRemote !== teamBase) {
    team = { ...remote.team };
  } else if (teamLocal !== teamBase && teamRemote !== teamBase && teamLocal !== teamRemote) {
    conflicts++;
  }
  // Ulkoasu on laitekohtainen valinta, joten se ei kulje mukana.
  team = { ...team, theme: local.team?.theme || 'system' };

  const state = {
    version: 1,
    team,
    players: sortById(players.list),
    staff: sortById(staff.list),
    matches: sortById(matches.list),
    lineups: sortById(lineups.list),
  };

  return {
    state,
    conflicts,
    changed: stable(payload(state)) !== stable(payload(remote)),
  };
}

const withoutTheme = ({ theme, ...rest }) => rest;

/** Pilveen tallennettava osa: ulkoasuvalinta jätetään pois. */
export function payload(state) {
  return {
    version: 1,
    team: withoutTheme(state.team || {}),
    players: sortById(state.players || []),
    staff: sortById(state.staff || []),
    matches: sortById(state.matches || []),
    lineups: sortById(state.lineups || []),
  };
}
