// Cloudflare Pages Functions: /api/presets
// Bind a D1 database as DB and set HOST_PASSWORD as a secret in the Pages dashboard.
const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const send = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS });

const SCHEMA = `CREATE TABLE IF NOT EXISTS workshop_presets (
 slug TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 links_json TEXT NOT NULL,
 updated_at TEXT NOT NULL
)`;
function slugify(input) {
  return String(input).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "workshop";
}
function validatePreset(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid preset.");
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) throw Error("Add a name for your workshop.");
  if (!Array.isArray(body.links) || !body.links.length || body.links.length > 20) {
    throw Error("Choose between 1 and 20 tabs.");
  }
  const links = body.links.map((item, i) => {
    if (!item || typeof item.url !== "string" || item.url.length > 2048) {
      throw Error("Invalid URL for tab " + (i + 1));
    }
    let url;
    try { url = new URL(item.url.trim()); } catch { throw Error("Invalid URL for tab " + (i + 1)); }
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw Error("Tab " + (i + 1) + " needs a normal http/https URL.");
    }
    return { title: String(item.title || "").trim().slice(0, 80) || "Page " + (i + 1), url: url.toString() };
  });
  const slug = body.slug == null || body.slug === "" ? slugify(name) : String(body.slug);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) throw Error("Invalid preset ID.");
  return { slug, name, links };
}
async function authorized(context) {
  const secret = context.env.HOST_PASSWORD;
  // Require a nontrivial password set in Cloudflare settings; never include in GitHub.
  if (typeof secret !== "string" || secret.length < 12) {
    return send({ error: "Set HOST_PASSWORD (at least 12 characters) as a Cloudflare Pages secret, then redeploy." }, 503);
  }
  const request = context.request;
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return send({ error: "Origin not allowed." }, 403);
  const sent = request.headers.get("X-Host-Password") || "";
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sent)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= (a[i] ^ b[i]);
  return mismatch === 0 ? null : send({ error: "Incorrect host password." }, 401);
}
async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) throw Error("Expected JSON.");
  const raw = await request.text();
  if (raw.length > 60000) throw Error("Preset too large.");
  try { return JSON.parse(raw); } catch { throw Error("Invalid JSON."); }
}
export async function onRequest(context) {
  const { request, env } = context;
  if (!["GET", "POST", "DELETE"].includes(request.method)) return send({ error: "Method not supported." }, 405);
  if (!env.DB) return send({ error: "Cloudflare D1 is not connected. Add a D1 binding named DB to the signals Pages project, then redeploy." }, 503);
  try {
    // Initialises the table automatically, without requiring a SQL-console step.
    await env.DB.prepare(SCHEMA).run();
    if (request.method === "GET") {
      const data = await env.DB.prepare("SELECT slug, name, links_json, updated_at FROM workshop_presets ORDER BY updated_at DESC LIMIT 100").all();
      return send({
        presets: (data.results || []).map(row => ({
          slug: row.slug, name: row.name, links: JSON.parse(row.links_json), updatedAt: row.updated_at
        }))
      });
    }
    const error = await authorized(context);
    if (error) return error;
    let body;
    try { body = await readJson(request); } catch (e) { return send({ error: e.message }, 400); }
    if (request.method === "POST") {
      let preset;
      try { preset = validatePreset(body); } catch (e) { return send({ error: e.message }, 400); }
      const updatedAt = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO workshop_presets (slug, name, links_json, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET
        name=excluded.name, links_json=excluded.links_json, updated_at=excluded.updated_at`)
        .bind(preset.slug, preset.name, JSON.stringify(preset.links), updatedAt).run();
      return send({ ok: true, preset: { ...preset, updatedAt } });
    }
    const slug = String(body?.slug || "");
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) return send({ error: "Invalid preset ID." }, 400);
    const result = await env.DB.prepare("DELETE FROM workshop_presets WHERE slug=?").bind(slug).run();
    return send({ ok: true, deleted: result.meta?.changes || 0 });
  } catch (err) {
    console.error("Workshop preset API failed", err);
    return send({ error: "Preset service encountered an error. Check Cloudflare Functions logs and the D1 binding." }, 500);
  }
}
