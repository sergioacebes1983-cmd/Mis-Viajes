const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 310000;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function base64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function randomId() { return crypto.randomUUID(); }
async function sha256(value) {
  return base64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return base64(bits);
}
function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
function sessionCookie(token, maxAge) {
  return `mv_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function validEmail(email) {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
async function readJson(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, "El cuerpo JSON no es válido."); }
}
async function currentUser(request, env) {
  const token = cookieValue(request, "mv_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  return await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
  ).bind(tokenHash, Math.floor(Date.now() / 1000)).first();
}
async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
  return user;
}
async function createSession(userId, env) {
  const token = base64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(tokenHash, userId, expiresAt).run();
  return token;
}
async function accessibleTrip(userId, tripId, env) {
  return await env.DB.prepare(
    `SELECT trips.id, trips.owner_id
     FROM trips JOIN trip_members ON trip_members.trip_id = trips.id
     WHERE trips.id = ? AND trip_members.user_id = ?`
  ).bind(tripId, userId).first();
}

async function route(request, env) {
  if (!env.DB) throw new HttpError(503, "La base de datos D1 no está configurada. Sigue el README.");
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/health") return json({ ok: true, service: "MI VIAJE API" });

  if (method === "POST" && path === "/register") {
    const data = await readJson(request);
    const email = String(data.email || "").trim().toLowerCase();
    const name = String(data.name || "").trim().slice(0, 80);
    const password = String(data.password || "");
    if (!validEmail(email)) throw new HttpError(400, "Introduce un correo válido.");
    if (name.length < 2) throw new HttpError(400, "El nombre debe tener al menos 2 caracteres.");
    if (password.length < 12 || password.length > 200) throw new HttpError(400, "La contraseña debe tener entre 12 y 200 caracteres.");
    const salt = base64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await passwordHash(password, salt);
    const id = randomId();
    try {
      await env.DB.prepare(
        "INSERT INTO users (id, email, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)"
      ).bind(id, email, name, salt, hash).run();
    } catch {
      throw new HttpError(409, "No se pudo crear la cuenta. Puede que ese correo ya esté registrado.");
    }
    const token = await createSession(id, env);
    return json({ user: { id, email, name } }, 201, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) });
  }

  if (method === "POST" && path === "/login") {
    const data = await readJson(request);
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user) throw new HttpError(401, "Correo o contraseña incorrectos.");
    const candidate = await passwordHash(password, user.password_salt);
    if (candidate !== user.password_hash) throw new HttpError(401, "Correo o contraseña incorrectos.");
    const token = await createSession(user.id, env);
    return json({ user: { id: user.id, email: user.email, name: user.display_name } }, 200,
      { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) });
  }

  if (method === "POST" && path === "/logout") {
    const token = cookieValue(request, "mv_session");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  if (method === "GET" && path === "/me") {
    const user = await currentUser(request, env);
    return json({ user: user ? { id: user.id, email: user.email, name: user.display_name } : null });
  }

  if (method === "GET" && path === "/trips") {
    const user = await requireUser(request, env);
    const { results } = await env.DB.prepare(
      `SELECT trips.*, trip_members.role,
       (SELECT COUNT(*) FROM trip_members tm WHERE tm.trip_id = trips.id) AS member_count
       FROM trips JOIN trip_members ON trip_members.trip_id = trips.id
       WHERE trip_members.user_id = ? ORDER BY trips.updated_at DESC`
    ).bind(user.id).all();
    return json({ trips: results });
  }

  if (method === "POST" && path === "/trips") {
    const user = await requireUser(request, env);
    const data = await readJson(request);
    const name = String(data.name || "").trim().slice(0, 120);
    if (name.length < 2) throw new HttpError(400, "El viaje necesita un nombre.");
    const id = randomId();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO trips (id, owner_id, name, destination, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, user.id, name, String(data.destination || "").slice(0, 160), String(data.start_date || "").slice(0, 10), String(data.end_date || "").slice(0, 10), String(data.notes || "").slice(0, 5000)),
      env.DB.prepare("INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')").bind(id, user.id)
    ]);
    return json({ id }, 201);
  }

  const tripMatch = path.match(/^\/trips\/([a-f0-9-]+)$/i);
  if (tripMatch && method === "GET") {
    const user = await requireUser(request, env);
    const trip = await accessibleTrip(user.id, tripMatch[1], env);
    if (!trip) throw new HttpError(404, "No se encuentra el viaje.");
    const record = await env.DB.prepare("SELECT * FROM trips WHERE id = ?").bind(trip.id).first();
    const { results: members } = await env.DB.prepare(
      "SELECT users.email, users.display_name, trip_members.role FROM trip_members JOIN users ON users.id = trip_members.user_id WHERE trip_members.trip_id = ?"
    ).bind(trip.id).all();
    return json({ trip: record, members });
  }

  if (tripMatch && method === "PUT") {
    const user = await requireUser(request, env);
    const trip = await accessibleTrip(user.id, tripMatch[1], env);
    if (!trip) throw new HttpError(404, "No se encuentra el viaje.");
    const data = await readJson(request);
    const name = String(data.name || "").trim().slice(0, 120);
    if (name.length < 2) throw new HttpError(400, "El viaje necesita un nombre.");
    await env.DB.prepare(
      "UPDATE trips SET name=?, destination=?, start_date=?, end_date=?, notes=?, updated_at=datetime('now') WHERE id=?"
    ).bind(name, String(data.destination || "").slice(0, 160), String(data.start_date || "").slice(0, 10), String(data.end_date || "").slice(0, 10), String(data.notes || "").slice(0, 5000), trip.id).run();
    return json({ ok: true });
  }

  if (tripMatch && method === "DELETE") {
    const user = await requireUser(request, env);
    const trip = await accessibleTrip(user.id, tripMatch[1], env);
    if (!trip) throw new HttpError(404, "No se encuentra el viaje.");
    if (trip.owner_id !== user.id) throw new HttpError(403, "Sólo quien creó el viaje puede eliminarlo.");
    await env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(trip.id).run();
    return json({ ok: true });
  }

  const memberMatch = path.match(/^\/trips\/([a-f0-9-]+)\/members$/i);
  if (memberMatch && method === "POST") {
    const user = await requireUser(request, env);
    const trip = await accessibleTrip(user.id, memberMatch[1], env);
    if (!trip) throw new HttpError(404, "No se encuentra el viaje.");
    if (trip.owner_id !== user.id) throw new HttpError(403, "Sólo el propietario puede añadir participantes.");
    const data = await readJson(request);
    const email = String(data.email || "").trim().toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, "Introduce un correo válido.");
    const target = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (!target) throw new HttpError(404, "Esa persona aún no tiene cuenta. Debe registrarse primero.");
    try {
      await env.DB.prepare("INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor')")
        .bind(trip.id, target.id).run();
    } catch {
      throw new HttpError(409, "Esa persona ya participa en este viaje.");
    }
    return json({ ok: true });
  }

  throw new HttpError(404, "Ruta no encontrada.");
}

export async function onRequest(context) {
  try {
    return await route(context.request, context.env);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Error interno. Revisa la configuración de D1.";
    return json({ error: message }, status);
  }
}
