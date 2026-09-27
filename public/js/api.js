'use strict';

const API = {
  async request(method, url, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const msg = data && data.error ? data.error : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  login(username, password) { return this.request('POST', '/api/auth/login', { username, password }); },
  logout() { return this.request('POST', '/api/auth/logout'); },
  me() { return this.request('GET', '/api/auth/me'); },
  register(data) { return this.request('POST', '/api/auth/register', data); },
  adminUsers() { return this.request('GET', '/api/admin/users'); },
  adminUpdate(id, data) { return this.request('PUT', '/api/admin/users/' + encodeURIComponent(id), data); },
  adminDelete(id) { return this.request('DELETE', '/api/admin/users/' + encodeURIComponent(id)); },
  updateProfile(p) { return this.request('PUT', '/api/users/me', p); },
  getEvents(from, to) {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return this.request('GET', `/api/events?${q.toString()}`);
  },
  createEvent(ev) { return this.request('POST', '/api/events', ev); },
  updateEvent(id, ev) { return this.request('PUT', `/api/events/${id}`, ev); },
  deleteEvent(id) { return this.request('DELETE', `/api/events/${id}`); }
};
