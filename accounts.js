'use strict';

const bcrypt = require('bcryptjs');

function validateAccount(body, passwordRequired = false) {
  if (passwordRequired) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Nombre obligatorio';
    if (typeof body.email !== 'string' || !body.email.trim()) return 'Email obligatorio';
    if (typeof body.passwordConfirm !== 'string' || !body.passwordConfirm || body.passwordConfirm !== body.password) return 'Confirma la contrasena; ambas deben coincidir';
  }
  if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,60}$/.test(body.username.trim())) return 'Username: usa entre 3 y 60 letras, numeros, puntos, guiones o guiones bajos';
  if (typeof body.name !== 'string' || body.name.trim().length > 100) return 'Nombre invalido (maximo 100 caracteres)';
  if (typeof body.email !== 'string' || body.email.length > 200 || (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) return 'Email invalido';
  if (passwordRequired || body.password) {
    if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password, 'utf8') > 72) return 'Contrasena: minimo 8 caracteres y maximo 72 bytes';
  }
  return null;
}

function mountAccounts(app, store, authRequired) {
  const adminRequired = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso exclusivo del administrador' });
    next();
  };
  const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const conflict = (username, id) => store.getDB().users.some(u => u.id !== id && u.username.toLowerCase() === username.toLowerCase());

  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const body = req.body || {};
    const error = validateAccount(body, true);
    if (error) return res.status(400).json({ error });
    const username = body.username.trim();
    if (username.toLowerCase() === 'xergno' || conflict(username)) return res.status(409).json({ error: 'Username no disponible' });
    const passwordHash = await bcrypt.hash(body.password, 10);
    // Another registration can finish while hashing.
    if (conflict(username)) return res.status(409).json({ error: 'Username no disponible' });
    const user = { id: store.uid(), username, name: body.name.trim(), email: body.email.trim(), passwordHash,
      avatar: '', role: 'user', disabled: false, createdAt: Date.now() };
    store.getDB().users.push(user);
    store.save();
    res.status(201).json({ user: store.publicUser(user) });
  }));

  app.get('/api/admin/users', authRequired, adminRequired, (req, res) => {
    const db = store.getDB();
    res.json({ users: db.users.map(user => ({ ...store.publicUser(user), createdAt: user.createdAt,
      eventCount: db.events.filter(event => event.userId === user.id).length })) });
  });

  app.put('/api/admin/users/:id', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const db = store.getDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const body = req.body || {};
    const error = validateAccount(body);
    if (error) return res.status(400).json({ error });
    if (typeof body.disabled !== 'boolean') return res.status(400).json({ error: 'Estado invalido' });
    if (user.role === 'admin' && body.disabled) return res.status(400).json({ error: 'No se puede bloquear al administrador' });
    const username = body.username.trim();
    if ((username.toLowerCase() === 'xergno' && user.role !== 'admin') || conflict(username, user.id)) return res.status(409).json({ error: 'Username no disponible' });
    const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : null;
    if (!db.users.includes(user)) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (conflict(username, user.id)) return res.status(409).json({ error: 'Username no disponible' });
    Object.assign(user, { username, name: body.name.trim(), email: body.email.trim(), disabled: body.disabled });
    if (passwordHash) user.passwordHash = passwordHash;
    if (passwordHash || body.disabled) db.sessions = db.sessions.filter(s => s.userId !== user.id);
    store.save();
    res.json({ user: store.publicUser(user) });
  }));

  app.delete('/api/admin/users/:id', authRequired, adminRequired, (req, res) => {
    const db = store.getDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.role === 'admin') return res.status(400).json({ error: 'No se puede borrar al administrador' });
    db.users = db.users.filter(u => u.id !== user.id);
    db.events = db.events.filter(e => e.userId !== user.id);
    db.sessions = db.sessions.filter(s => s.userId !== user.id);
    store.save();
    res.json({ ok: true });
  });
}

module.exports = { mountAccounts };
