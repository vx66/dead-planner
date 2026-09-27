'use strict';

const Accounts = {
  users: [],
  editId: null,
  busy: false,
  init() {
    const el = id => document.getElementById(id);
    el('register-open').addEventListener('click', () => {
      el('register-form').reset();
      el('register-msg').textContent = '';
      App.openModal('register-modal');
      el('rg-user').focus();
    });
    el('register-close').addEventListener('click', () => App.closeModal('register-modal'));
    el('register-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (el('rg-pass').value !== el('rg-confirm').value) {
        el('register-msg').textContent = 'Las contraseñas no coinciden'; return;
      }
      const button = e.target.querySelector('[type=submit]');
      button.disabled = true;
      el('register-msg').textContent = '';
      try {
        await API.register({username: el('rg-user').value.trim(), name: el('rg-name').value.trim(), email: el('rg-email').value.trim(), password: el('rg-pass').value, passwordConfirm: el('rg-confirm').value});
        el('login-user').value = el('rg-user').value.trim();
        el('register-form').reset();
        App.closeModal('register-modal');
        App.toast('CUENTA CREADA. INICIA SESIÓN');
        el('login-pass').focus();
      } catch (error) { el('register-msg').textContent = error.message; }
      finally { button.disabled = false; }
    });
    el('admin-open').addEventListener('click', () => {
      if (DP.user?.role !== 'admin') return;
      this.cancelEdit();
      App.openModal('admin-modal');
      this.load();
    });
    el('admin-close').addEventListener('click', () => { this.cancelEdit(); App.closeModal('admin-modal'); });
    el('admin-refresh').addEventListener('click', () => { if (!this.busy) this.load(); });
    el('admin-cancel').addEventListener('click', () => this.cancelEdit());
    el('admin-list').addEventListener('click', async e => {
      const button = e.target.closest('button[data-id]');
      if (!button || this.busy) return;
      const user = this.users.find(u => u.id === button.dataset.id);
      if (!user) return;
      if (button.dataset.action === 'edit') {
        this.editId = user.id;
        el('au-name').value = user.name;
        el('au-email').value = user.email;
        el('au-user').value = user.username;
        el('au-password').value = '';
        el('au-disabled').checked = user.disabled;
        el('au-disabled').disabled = user.role === 'admin';
        el('admin-form').classList.remove('hidden');
        el('au-name').focus();
      } else if (window.confirm(`¿Borrar a ${user.username}? Se eliminarán permanentemente su cuenta, tareas y sesiones.`)) {
        this.busy = true;
        button.disabled = true;
        try { await API.adminDelete(user.id); this.cancelEdit(); await this.load(); }
        catch (error) { this.error(error); }
        finally { this.busy = false; button.disabled = false; }
      }
    });
    el('admin-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (this.busy || !this.editId) return;
      this.busy = true;
      const id = this.editId;
      const password = el('au-password').value;
      const button = e.target.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const data = await API.adminUpdate(id, {name:el('au-name').value.trim(), email:el('au-email').value.trim(), username:el('au-user').value.trim(), password, disabled:el('au-disabled').checked});
        this.cancelEdit();
        if (DP.user?.id === id) {
          if (password) { App.showLogin(); App.toast('CONTRASEÑA CAMBIADA. INICIA SESIÓN'); return; }
          DP.user = data.user; App.renderTopUser();
        }
        await this.load();
        App.toast('USUARIO ACTUALIZADO');
      } catch (error) { this.error(error); }
      finally { this.busy = false; button.disabled = false; }
    });
  },
  cancelEdit() {
    this.editId = null;
    document.getElementById('admin-form').classList.add('hidden');
    document.getElementById('au-password').value = '';
  },
  error(error) {
    document.getElementById('admin-msg').textContent = error.message;
    if (error.status === 401) App.showLogin();
    if (error.status === 403) App.closeModal('admin-modal');
  },
  async load() {
    const user = DP.user;
    document.getElementById('admin-msg').textContent = '';
    try {
      const data = await API.adminUsers();
      if (DP.user !== user || DP.user?.role !== 'admin') return;
      this.users = data.users;
      document.getElementById('admin-count').textContent = `${this.users.length} usuarios registrados`;
      document.getElementById('admin-list').innerHTML = `<table class="admin-table"><thead><tr><th>Usuario</th><th>Nombre / email</th><th>Estado</th><th>Tareas</th><th>Acciones</th></tr></thead><tbody>${this.users.map(u => `<tr><td>${escHtml(u.username)}</td><td>${escHtml(u.name)}<br>${escHtml(u.email)}</td><td>${u.role === 'admin' ? 'ADMIN' : u.disabled ? 'BLOQUEADO' : 'ACTIVO'}</td><td>${Number(u.eventCount) || 0}</td><td><button class="btn" data-id="${escHtml(u.id)}" data-action="edit">EDITAR</button>${u.role === 'admin' ? '' : `<button class="btn danger" data-id="${escHtml(u.id)}" data-action="delete">BORRAR</button>`}</td></tr>`).join('')}</tbody></table>`;
    } catch (error) { this.error(error); }
  }
};
