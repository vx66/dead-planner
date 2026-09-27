'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = { users: [], sessions: [], events: [] };

let db = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.events)) {
        throw new Error('Estructura de base de datos invalida');
      }
      db = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        events: Array.isArray(parsed.events) ? parsed.events : []
      };
      return db;
    } catch (err) {
      throw new Error('No se pudo leer db.json; se conserva el archivo original: ' + err.message);
    }
  }
  db = JSON.parse(JSON.stringify(DEFAULT_DB));
  save();
  return db;
}

function save() {
  if (!db) throw new Error('Base de datos no cargada');
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function uid() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function getDB() {
  if (!db) load();
  return db;
}

function findUserById(id) {
  return getDB().users.find((u) => u.id === id) || null;
}

function findUserByUsername(username) {
  const name = String(username || '').toLowerCase().trim();
  return getDB().users.find((u) => u.username.toLowerCase() === name) || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name || '',
    email: user.email || '',
    avatar: user.avatar || '',
    role: user.role === 'admin' ? 'admin' : 'user',
    disabled: Boolean(user.disabled)
  };
}

module.exports = {
  getDB,
  save,
  uid,
  load,
  findUserById,
  findUserByUsername,
  publicUser
};
