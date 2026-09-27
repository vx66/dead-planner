'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const store = require('./store');
const DateUtil = require('./public/js/date');

const PORT = process.env.PORT || 3000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = 'dp_session';
const SEED_USERNAME = process.env.SEED_USERNAME || 'Xergno';
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'simbionte67';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');

const app = express();
app.use(express.json({ limit: '6mb' }));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
      catch (err) { /* Ignore malformed cookies. */ }
    }
  }
  return out;
}

function sessionUser(token) {
  if (!token) return null;
  const db = store.getDB();
  const session = db.sessions.find((s) => s.token === token && s.expiresAt > Date.now());
  if (!session) return null;
  const user = store.findUserById(session.userId);
  return user && !user.disabled ? user : null;
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${COOKIE_SECURE ? '; Secure' : ''}`);
}

function eventTime(value) {
  if (typeof value !== 'string') return NaN;
  const local = DateUtil.parseISO(value);
  if (local) return local.getTime();
  // Preserve support for explicit offsets, while rejecting impossible dates.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return NaN;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (date.getUTCFullYear() !== +m[1] || date.getUTCMonth() !== +m[2] - 1 || date.getUTCDate() !== +m[3] ||
      +m[4] > 23 || +m[5] > 59 || +(m[6] || 0) > 59) return NaN;
  return new Date(value).getTime();
}

function validColor(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
}

function validTag(tag) {
  return tag === null || (tag && typeof tag.id === 'string' && tag.id.length > 0 && tag.id.length <= 100 &&
    typeof tag.name === 'string' && tag.name.trim().length > 0 && tag.name.length <= 40 && validColor(tag.color));
}

function copyTag(tag) {
  return tag ? { id: tag.id, name: tag.name.trim(), color: tag.color } : null;
}

function authRequired(req, res, next) {
  const user = sessionUser(parseCookies(req)[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: 'Sesion no valida' });
  req.user = user;
  next();
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

function seed() {
  const db = store.getDB();
  if (db.users.length === 0) {
    if (process.env.NODE_ENV === 'production' && (!process.env.SEED_PASSWORD || SEED_PASSWORD.length < 12 || Buffer.byteLength(SEED_PASSWORD, 'utf8') > 72 || SEED_PASSWORD === 'simbionte67')) {
      throw new Error('Configura SEED_PASSWORD con una contrasena unica de 12 caracteres como minimo (maximo 72 bytes)');
    }
    const hash = bcrypt.hashSync(SEED_PASSWORD, 10);
    db.users.push({
      id: store.uid(),
      username: SEED_USERNAME,
      name: SEED_USERNAME,
      email: '',
      passwordHash: hash,
      avatar: '',
      createdAt: Date.now()
    });
    console.log('[seed] Usuario principal creado:', SEED_USERNAME);
    store.save();
  }
  // purge expired sessions
  let migrated = false;
  for (const user of db.users) {
    if (!user.role) {
      user.role = user.username.toLowerCase() === 'xergno' ? 'admin' : 'user';
      user.disabled = false;
      migrated = true;
    }
  }
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
  if (migrated || db.sessions.length !== before) store.save();
}
seed();

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos' });

  const user = store.findUserByUsername(username);
  if (!user || user.disabled || !bcrypt.compareSync(String(password), user.passwordHash)) {
    return res.status(401).json({ error: 'Acceso denegado: credenciales invalidas' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  store.getDB().sessions.push({ token, userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  store.save();
  setCookie(res, token);
  res.json({ ok: true, user: store.publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME];
  const db = store.getDB();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  store.save();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = sessionUser(parseCookies(req)[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  res.json({ user: store.publicUser(user) });
});

require('./accounts').mountAccounts(app, store, authRequired);

/* ------------------------------------------------------------------ */
/* User profile                                                        */
/* ------------------------------------------------------------------ */

app.put('/api/users/me', authRequired, (req, res) => {
  const db = store.getDB();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { name, email, username, avatar } = req.body || {};

  if (typeof username === 'string' && username.trim()) {
    const candidate = username.trim();
    if (candidate.toLowerCase() === 'xergno' && user.role !== 'admin') return res.status(409).json({ error: 'Username reservado' });
    const clash = db.users.find((u) => u.id !== user.id && u.username.toLowerCase() === candidate.toLowerCase());
    if (clash) return res.status(409).json({ error: 'Username ya esta en uso' });
    user.username = candidate;
  }
  if (typeof name === 'string') user.name = name.trim();
  if (typeof email === 'string') user.email = email.trim();
  if (typeof avatar === 'string') user.avatar = avatar.trim();

  store.save();
  res.json({ ok: true, user: store.publicUser(user) });
});

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

app.get('/api/events', authRequired, (req, res) => {
  const { from, to } = req.query;
  let events = store.getDB().events.filter((e) => e.userId === req.user.id);

  if (from || to) {
    const f = from ? eventTime(from) : -Infinity;
    const t = to ? eventTime(to) : Infinity;
    if (Number.isNaN(f) || Number.isNaN(t) || t <= f) return res.status(400).json({ error: 'Rango de fechas invalido' });
    events = events.filter((e) => {
      const s = new Date(e.start).getTime();
      const e2 = new Date(e.end).getTime();
      return e2 >= f && s <= t;
    });
  }

  res.json({ events: events.map((e) => ({ ...e })) });
});

app.post('/api/events', authRequired, (req, res) => {
  const { title, start, end, color, description, tag } = req.body || {};
  if (tag !== undefined && !validTag(tag)) return res.status(400).json({ error: 'Etiqueta invalida' });
  if (typeof title !== 'string' || !title.trim() || !start || !end) return res.status(400).json({ error: 'Faltan campos (title, start, end)' });
  if (color !== undefined && !validColor(color)) return res.status(400).json({ error: 'Color invalido' });

  const startT = eventTime(start);
  const endT = eventTime(end);
  if (isNaN(startT) || isNaN(endT)) return res.status(400).json({ error: 'Fechas invalidas' });
  if (endT <= startT) return res.status(400).json({ error: 'El fin debe ser posterior al inicio' });

  const event = {
    id: store.uid(),
    userId: req.user.id,
    title: title.trim().slice(0, 200),
    description: description ? String(description).slice(0, 500) : '',
    color: tag ? tag.color : color || '#00ff41',
    tag: copyTag(tag),
    start: fixISO(new Date(startT)),
    end: fixISO(new Date(endT)),
    createdAt: Date.now()
  };

  store.getDB().events.push(event);
  store.save();
  res.status(201).json({ event: { ...event } });
});

app.put('/api/events/:id', authRequired, (req, res) => {
  const db = store.getDB();
  const event = db.events.find((e) => e.id === req.params.id && e.userId === req.user.id);
  if (!event) return res.status(404).json({ error: 'Tarea no encontrada' });

  const { title, description, color, start, end, tag } = req.body || {};
  if (tag !== undefined && !validTag(tag)) return res.status(400).json({ error: 'Etiqueta invalida' });

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) return res.status(400).json({ error: 'Titulo requerido' });
  if (color !== undefined && !validColor(color)) return res.status(400).json({ error: 'Color invalido' });
  if (start !== undefined || end !== undefined) {
    const startT = eventTime(start === undefined ? event.start : start);
    const endT = eventTime(end === undefined ? event.end : end);
    if (isNaN(startT) || isNaN(endT)) return res.status(400).json({ error: 'Fechas invalidas' });
    if (endT <= startT) return res.status(400).json({ error: 'El fin debe ser posterior al inicio' });
    event.start = fixISO(new Date(startT));
    event.end = fixISO(new Date(endT));
  }
  if (typeof title === 'string') event.title = title.trim().slice(0, 200);
  if (typeof description === 'string') event.description = description.slice(0, 500);
  if (typeof color === 'string') event.color = color;
  if (tag !== undefined) event.tag = copyTag(tag);
  if (event.tag) event.color = event.tag.color;

  store.save();
  res.json({ event: { ...event } });
});

app.delete('/api/events/:id', authRequired, (req, res) => {
  const db = store.getDB();
  const before = db.events.length;
  db.events = db.events.filter((e) => !(e.id === req.params.id && e.userId === req.user.id));
  if (db.events.length === before) return res.status(404).json({ error: 'Tarea no encontrada' });
  store.save();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Static                                                              */
/* ------------------------------------------------------------------ */

app.get('/api/health', (req, res) => {
  store.getDB();
  res.json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err) {
    console.error('[server] error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  next();
});

/* ------------------------------------------------------------------ */

app.listen(PORT, () => {
  console.log('============================================');
  console.log('  DEAD PLANNER TERMINAL v1.0');
  console.log(`  ONLINE on port ${PORT}`);
  console.log('  storage:', path.join(__dirname, 'data'));
  console.log('============================================');
});

function fixISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
