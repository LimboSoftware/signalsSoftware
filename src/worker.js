const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const newToken = count => hex(crypto.getRandomValues(new Uint8Array(count)));
async function digest(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(bytes));
}
function validateLinks(links) {
  if (!Array.isArray(links) || links.length > 3) throw Error('Please supply up to three links.');
  return links.map((link, n) => {
    if (!link || typeof link.url !== 'string') throw Error('Page ' + (n + 1) + ' needs a URL.');
    if (link.url.length > 2048) throw Error('Page ' + (n + 1) + ' has a very long URL.');
    let url;
    try { url = new URL(link.url.trim()); } catch { throw Error('Page ' + (n + 1) + ' is not a valid URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw Error('Page ' + (n + 1) + ' must be a normal http or https website URL.');
    }
    const title = String(link.title || '').trim().slice(0, 80) || url.hostname;
    return { title, url: url.toString() };
  });
}
function cleanId(raw) {
  const id = String(raw || '').trim().toUpperCase();
  return /^[A-Z2-9]{6}$/.test(id) ? id : null;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!env.DB) return json({ error: 'Database not configured. See README.' }, 503);
      if (url.pathname === '/api/create' && request.method === 'POST') {
        const hostKey = newToken(24);
        const hostHash = await digest(hostKey);
        for (let attempt = 0; attempt < 5; attempt++) {
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const room = [...crypto.getRandomValues(new Uint8Array(6))].map(i => alphabet[i % alphabet.length]).join('');
          const result = await env.DB.prepare('INSERT OR IGNORE INTO rooms (room, host_hash, links_json, revision, updated_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)')
            .bind(room, hostHash, '[]').run();
          if (result.meta?.changes === 1) return json({ room, hostKey }, 201);
        }
        return json({ error: 'Could not create a new room. Try again.' }, 500);
      }
      const match = url.pathname.match(/^\/api\/room\/([^/]+)$/);
      const room = match ? cleanId(match[1]) : null;
      if (match && !room) return json({ error: 'Room codes contain six characters.' }, 400);
      if (room && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT links_json, revision, updated_at FROM rooms WHERE room = ?').bind(room).first();
        if (!row) return json({ error: 'Room not found. Check the code.' }, 404);
        return json({ room, links: JSON.parse(row.links_json), revision: row.revision, updatedAt: row.updated_at });
      }
      if (room && request.method === 'PUT') {
        if (!String(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
        if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: 'Wrong origin.' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
        if (typeof body.hostKey !== 'string' || !/^[a-f0-9]{48}$/.test(body.hostKey)) return json({ error: 'Host access key missing.' }, 403);
        const stored = await env.DB.prepare('SELECT host_hash FROM rooms WHERE room = ?').bind(room).first();
        if (!stored) return json({ error: 'Room not found.' }, 404);
        if (await digest(body.hostKey) !== stored.host_hash) return json({ error: 'Only the host can change these links.' }, 403);
        let links;
        try { links = validateLinks(body.links); } catch (e) { return json({ error: e.message }, 400); }
        await env.DB.prepare('UPDATE rooms SET links_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE room = ?')
          .bind(JSON.stringify(links), room).run();
        return json({ ok: true, links });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Something went wrong. Please retry.' }, 500);
    }
  },
};
