// Kevyt jäljitelmä Supabasen REST- ja auth-rajapinnoista testejä varten.
// Ei salausta eikä oikeaa tarkistusta – vain sen verran, että synkronoinnin
// logiikka (yhdistäminen, versiolukko, uudelleenyritys) tulee testattua.

export function createFakeSupabase() {
  const users = new Map();   // email -> { id, password }
  const rows = new Map();    // user_id -> { data, rev }
  const tokens = new Map();  // access_token -> user_id
  let counter = 0;

  const session = (user) => {
    const access = `token-${++counter}`;
    tokens.set(access, user.id);
    return {
      access_token: access,
      refresh_token: `refresh-${user.id}`,
      expires_in: 3600,
      user: { id: user.id, email: user.email },
    };
  };

  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  /** @returns {boolean} käsiteltiinkö pyyntö */
  return function handle(req, res, prefix) {
    if (!req.url.startsWith(prefix)) return false;
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.slice(prefix.length);

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const auth = (req.headers.authorization || '').replace('Bearer ', '');
      const uid = tokens.get(auth);

      if (path === '/auth/v1/signup') {
        if (users.has(body.email)) return send(res, 400, { msg: 'Tunnus on jo olemassa' });
        const user = { id: `user-${users.size + 1}`, email: body.email, password: body.password };
        users.set(body.email, user);
        return send(res, 200, session(user));
      }

      if (path === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const id = String(body.refresh_token || '').replace('refresh-', '');
          const user = [...users.values()].find((u) => u.id === id);
          if (!user) return send(res, 400, { error_description: 'Virheellinen tunniste' });
          return send(res, 200, session(user));
        }
        const user = users.get(body.email);
        if (!user || user.password !== body.password) {
          return send(res, 400, { error_description: 'Väärä sähköposti tai salasana' });
        }
        return send(res, 200, session(user));
      }

      if (path === '/auth/v1/logout') return send(res, 204);

      if (path === '/rest/v1/pelikirja') {
        if (!uid) return send(res, 401, { message: 'Ei oikeuksia' });

        if (req.method === 'GET') {
          const row = rows.get(uid);
          return send(res, 200, row ? [{ data: row.data, rev: row.rev }] : []);
        }

        if (req.method === 'POST') {
          rows.set(uid, { data: body.data, rev: body.rev ?? 1 });
          return send(res, 201, [rows.get(uid)]);
        }

        if (req.method === 'PATCH') {
          const row = rows.get(uid);
          const expected = (url.searchParams.get('rev') || '').replace('eq.', '');
          if (!row || String(row.rev) !== expected) return send(res, 200, []);  // versiolukko
          rows.set(uid, { data: body.data, rev: body.rev });
          return send(res, 200, [rows.get(uid)]);
        }
      }

      send(res, 404, { message: 'Tuntematon polku: ' + path });
    });
    return true;
  };
}
