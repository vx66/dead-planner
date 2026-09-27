

'use strict';

const App = {
  toastTimer: null,
  avatarData: null,
  editEventId: null,

  init() {
    Accounts.init();
    this.bindLogin();
    this.bindProfile();
    this.bindTaskModal();
    this.bindLogout();
    this.buildColorSwatches();
    this.checkSession();
    this.startTerminal();
  },

  /* ================= session / boot ================= */

  startTerminal() {
    const el = document.getElementById('terminal-typed');
    if (!el) return;
    const lines = [
      'cat /var/log/planner.txt',
      'cat /var/log/deadline.log',
      'cat /var/log/doom.txt',
      'ls -la --do-today'
    ];
    let line = 0, ch = 0, deleting = false, t = null;
    const loop = () => {
      const cur = lines[line];
      if (!deleting) {
        ch++;
        el.textContent = cur.substring(0, ch);
        t = setTimeout(loop, ch === cur.length ? 2000 : 55);
        if (ch === cur.length) deleting = true;
      } else {
        ch--;
        el.textContent = cur.substring(0, ch);
        if (ch === 0) { deleting = false; line = (line + 1) % lines.length; t = setTimeout(loop, 360); }
        else t = setTimeout(loop, 16);
      }
    };
    loop();
  },

  async checkSession() {
    let data;
    try {
      data = await API.me();
    } catch (e) {
      this.showLogin();
      if (e.status !== 401) this.toast('ERROR: ' + e.message, true);
      return;
    }
    this.enterApp(data.user);
  },

  showLogin() {
    Calendar.requestId++;
    Calendar.resetInteractionState();
    DP.user = null;
    DP.events.clear();
    DP.selectedId = null;
    DP.scrollDone = false;
    this.closeModal('task-modal');
    this.closeModal('profile-modal');
    this.closeModal('admin-modal');
    if (typeof Accounts !== 'undefined') {
      Accounts.users = [];
      Accounts.editId = null;
    }
    document.getElementById('admin-list').innerHTML = '';
    document.getElementById('au-password').value = '';
    document.getElementById('admin-open').classList.add('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-error').textContent = '';
  },

  enterApp(user) {
    DP.user = user;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    this.renderTopUser();
    Calendar.init();
    Calendar.currentTag = null;
    Calendar.initTags();
    Calendar.renderTags();
    Calendar.reload();
  },

  async handleLogout() {
    try {
      await API.logout();
      this.showLogin();
    } catch (e) {
      this.toast('ERROR: ' + e.message, true);
    }
  },

  renderTopUser() {
    const u = DP.user;
    if (!u) return;
    document.getElementById('top-username').textContent = u.username;
    document.getElementById('top-avatar').innerHTML = avatarHTML(u);
    document.getElementById('admin-open').classList.toggle('hidden', u.role !== 'admin');
  },

  /* ================= login ================= */

  bindLogin() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userField = document.getElementById('login-user');
      const passField = document.getElementById('login-pass');
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      if (!userField.value || !passField.value) {
        errEl.textContent = '> ERROR: Complete los dos campos';
        return;
      }
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = '[ VERIFICANDO... ]';
      try {
        const data = await API.login(userField.value.trim(), passField.value);
        passField.value = '';
        this.enterApp(data.user);
      } catch (err) {
        errEl.textContent = '> ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '[ ENTER ]';
      }
    });
  },

  /* ================= profile ================= */

  bindProfile() {
    document.getElementById('profile-btn').addEventListener('click', () => this.openProfile());
    document.getElementById('pf-cancel').addEventListener('click', () => this.closeModal('profile-modal'));

    document.getElementById('pf-avatar-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        document.getElementById('pf-msg').textContent = '> ERROR: imagen demasiado grande (max 4MB)';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        this.avatarData = reader.result;
        document.getElementById('avatar-preview').innerHTML = `<img src="${reader.result}" alt="avatar">`;
        document.getElementById('pf-avatar-url').value = '';
        document.getElementById('pf-msg').textContent = '';
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('pf-avatar-url').addEventListener('input', (e) => {
      this.avatarData = null;
      const preview = document.getElementById('avatar-preview');
      preview.innerHTML = e.target.value.trim() ? `<img src="${escHtml(e.target.value.trim())}" alt="avatar">` : initialHTML(DP.user);
    });

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('pf-msg');
      const username = document.getElementById('pf-username').value.trim();
      if (!username) {
        msg.textContent = '> ERROR: el username no puede estar vacio';
        return;
      }
      const avatar = this.avatarData || document.getElementById('pf-avatar-url').value.trim();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = '[ GUARDANDO... ]';
      try {
        const data = await API.updateProfile({
          name: document.getElementById('pf-name').value.trim(),
          email: document.getElementById('pf-email').value.trim(),
          username,
          avatar
        });
        DP.user = data.user;
        this.renderTopUser();
        this.avatarData = null;
        document.getElementById('pf-avatar-file').value = '';
        this.closeModal('profile-modal');
        this.toast('PERFIL ACTUALIZADO OK');
      } catch (err) {
        msg.textContent = '> ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '[ GUARDAR ]';
      }
    });
  },

  openProfile() {
    const u = DP.user;
    if (!u) return;
    this.avatarData = u.avatar || null;
    document.getElementById('pf-name').value = u.name || '';
    document.getElementById('pf-email').value = u.email || '';
    document.getElementById('pf-username').value = u.username || '';
    document.getElementById('pf-avatar-url').value = (u.avatar && u.avatar.startsWith('http')) ? u.avatar : '';
    document.getElementById('pf-avatar-file').value = '';
    document.getElementById('pf-msg').textContent = '';
    document.getElementById('avatar-preview').innerHTML = avatarHTML(u);
    document.getElementById('profile-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('pf-name').focus(), 50);
  },

  /* ================= task modal ================= */

  bindTaskModal() {
    document.getElementById('tk-tag-add').addEventListener('click', () => Calendar.addTag());
    document.getElementById('tk-tag-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); Calendar.addTag(); }
    });
    document.getElementById('tk-cancel').addEventListener('click', () => this.closeModal('task-modal'));

    document.getElementById('tk-colors').addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      DP.currentColor = sw.dataset.color;
      Calendar.currentTag = null;
      Calendar.renderTags();
      document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s === sw));
    });

    const autoSize = (fromEl, toEl) => {
      const fromVal = toEl.value ? DateUtil.parseISO(toEl.value) : null;
      const from = DateUtil.parseISO(fromEl.value);
      if (!from) return;
      if (fromVal && from.getTime() >= fromVal.getTime()) {
        toEl.value = DateUtil.toISO(new Date(from.getTime() + 30 * 60000));
      }
    };
    document.getElementById('tk-start').addEventListener('change', () => autoSize(document.getElementById('tk-start'), document.getElementById('tk-end')));

    document.getElementById('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTask(e.target);
    });

    document.getElementById('tk-delete').addEventListener('click', async () => {
      if (!this.editEventId) return;
      if (!window.confirm('> BORRAR tarea permanente? (y/n)')) return;
      try {
        await API.deleteEvent(this.editEventId);
        this.closeModal('task-modal');
        this.toast('TAREA BORRADA');
        Calendar.reload();
      } catch (err) {
        document.getElementById('tk-msg').textContent = '> ' + err.message;
      }
    });
  },

  buildColorSwatches() {
    const wrap = document.getElementById('tk-colors');
    wrap.innerHTML = '';
    for (const c of COLORS) {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (c === DP.currentColor ? ' selected' : '');
      sw.dataset.color = c;
      sw.style.background = c;
      sw.title = c;
      wrap.appendChild(sw);
    }
  },

  openNewTask(startDate) {
    Calendar.currentTag = null;
    Calendar.renderTags();
    document.getElementById('tk-tag-msg').textContent = '';
    this.editEventId = null;
    document.getElementById('task-modal-title').textContent = 'NEW_TASK // crear';
    document.getElementById('tk-title').value = '';
    document.getElementById('tk-desc').value = '';
    document.getElementById('tk-start').value = DateUtil.toISO(startDate || new Date());
    document.getElementById('tk-end').value = DateUtil.toISO(new Date((startDate || new Date()).getTime() + 30 * 60000));
    document.getElementById('tk-msg').textContent = '';
    document.getElementById('tk-delete').classList.add('hidden');
    DP.currentColor = COLORS[0];
    this.selectColor(DP.currentColor);
    this.openModal('task-modal');
    setTimeout(() => document.getElementById('tk-title').focus(), 50);
  },

  openEditTask(id) {
    const ev = DP.events.get(id);
    if (!ev) return;
    this.editEventId = id;
    document.getElementById('task-modal-title').textContent = 'EDIT_TASK // ' + id.slice(0, 6);
    document.getElementById('tk-title').value = ev.title || '';
    document.getElementById('tk-desc').value = ev.description || '';
    document.getElementById('tk-start').value = DateUtil.toISO(new Date(ev.start));
    document.getElementById('tk-end').value = DateUtil.toISO(new Date(ev.end));
    document.getElementById('tk-msg').textContent = '';
    document.getElementById('tk-delete').classList.remove('hidden');
    DP.currentColor = taskColor(ev.color);
    Calendar.currentTag = ev.tag || null;
    Calendar.renderTags();
    document.getElementById('tk-tag-msg').textContent = '';
    this.selectColor(DP.currentColor);
    this.openModal('task-modal');
    setTimeout(() => document.getElementById('tk-title').focus(), 50);
  },

  selectColor(color) {
    document.querySelectorAll('.swatch').forEach((s) => {
      s.classList.toggle('selected', s.dataset.color === color);
    });
  },

  async saveTask(form) {
    const msg = document.getElementById('tk-msg');
    const title = document.getElementById('tk-title').value.trim();
    const start = DateUtil.parseISO(document.getElementById('tk-start').value);
    const end = DateUtil.parseISO(document.getElementById('tk-end').value);
    const description = document.getElementById('tk-desc').value.trim();

    if (!title) { msg.textContent = '> ERROR: titulo requerido'; return; }
    if (!start || !end) { msg.textContent = '> ERROR: fechas invalidas'; return; }
    if (end.getTime() <= start.getTime()) { msg.textContent = '> ERROR: el fin debe ser posterior al inicio'; return; }

    const payload = {
      title,
      description,
      start: DateUtil.toISO(start),
      end: DateUtil.toISO(end),
      color: DP.currentColor,
      tag: Calendar.currentTag ? { ...Calendar.currentTag } : null
    };

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '[ GUARDANDO... ]';
    try {
      if (this.editEventId) await API.updateEvent(this.editEventId, payload);
      else await API.createEvent(payload);
      this.closeModal('task-modal');
      this.toast('TAREA GUARDADA');
      await Calendar.reload();
    } catch (err) {
      msg.textContent = '> ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '[ GUARDAR ]';
    }
  },

  /* ================= misc UI ================= */

  bindLogout() {
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
  },

  openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '');
    el.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }
};

/* ---------------- helpers ---------------- */

function initialHTML(u) {
  const letter = (u && u.username ? u.username.charAt(0) : '?').toUpperCase();
  return `<span>${escHtml(letter)}</span>`;
}

function avatarHTML(u) {
  if (!u) return '';
  if (u.avatar) return `<img src="${escHtml(u.avatar)}" alt="avatar" onerror="this.parentNode.textContent=this.dataset.initial" data-initial="${escHtml((u.username || '?').charAt(0).toUpperCase())}">`;
  return initialHTML(u);
}

function inlineLetter(u) {
  return '<span>' + (u && u.username ? u.username.charAt(0) : '?').toUpperCase() + '</span>';
}

document.addEventListener('DOMContentLoaded', () => App.init());

// puente: si el codigo de app.js referencia DP y calendar.js define DP como const,
// exponerlo tambien en window para no depender del orden de carga.
if (typeof window !== 'undefined' && typeof DP !== 'undefined') {
  window.DP = DP;
  window.Calendar = Calendar;
}
