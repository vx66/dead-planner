var URG_LABELS = {
  1: 'bajo',
  2: 'medio',
  3: 'alto',
  4: 'urgente'
};
function mdLite(t) {
  return escHtml(t == null ? '' : t).replace(/\r?\n/g, '<br>');
}

function taskColor(color) {
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^[0-7]$/.test(String(color))) return COLORS[Number(color)];
  return COLORS[0];
}

const DP = {
  date: new Date(),
  view: 'day',
  events: new Map(),
  user: null,
  selectedId: null,
  currentColor: '#00ff41',
  drag: null,          // active drag session
  suppressClick: false,
  scrollDone: false
};

const PX_PER_HOUR = 60;
const DAY_MINUTES = 1440;
const DAY_START_HOUR = 5;
const VISIBLE_HOURS = 24;
const VISIBLE_MINUTES = VISIBLE_HOURS * 60;
const VISIBLE_START_MIN = DAY_START_HOUR * 60;
const COLORS = ['#00ff41', '#00ffff', '#ffff00', '#ff00ff', '#ff8800', '#ff0044', '#00ccff', '#aaff00'];

const Calendar = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.getElementById('calendar');
    this.bindNav();
    this.bindContainer();
    this.initTags();
    this.renderTags();
    this.updateTaskColor();
  },

  /* ---------------- navigation ---------------- */

  bindNav() {
    document.getElementById('view-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-nav');
      if (!btn) return;
      this.setView(btn.dataset.view);
    });
    document.getElementById('prev-btn').addEventListener('click', () => this.navigate(-1));
    document.getElementById('next-btn').addEventListener('click', () => this.navigate(1));
    document.getElementById('today-btn').addEventListener('click', () => this.today());
    document.getElementById('add-task-btn').addEventListener('click', () => {
      const base = DP.view === 'year'
        ? new Date(DP.date.getFullYear(), 0, 1)
        : DP.view === 'month'
          ? new Date(DP.date.getFullYear(), DP.date.getMonth(), 1)
          : DP.view === 'week'
            ? DateUtil.startOfWeek(DP.date)
            : DateUtil.dayStart(DP.date);
      const now = new Date();
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), now.getHours(), now.getMinutes(), 0, 0);
      App.openNewTask(date);
    });
  },

  setView(v) {
    if (!['day', 'week', 'month', 'year'].includes(v) || DP.view === v) return;
    DP.view = v;
    if (v === 'year') DP.date = new Date(DP.date.getFullYear(), 0, 1);
    if (v === 'month') DP.date = new Date(DP.date.getFullYear(), DP.date.getMonth(), 1);
    if (v === 'week') DP.date = DateUtil.startOfWeek(DP.date);
    DP.scrollDone = false;
    this.reload();
  },

  syncNavButtons() {
    document.querySelectorAll('.btn-nav').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === DP.view);
    });
  },

  navigate(dir) {
    const d = DP.date;
    if (DP.view === 'day') DP.date = DateUtil.addDays(d, dir);
    if (DP.view === 'week') DP.date = DateUtil.addDays(d, dir * 7);
    if (DP.view === 'month') DP.date = DateUtil.addMonths(d, dir);
    if (DP.view === 'year') DP.date = new Date(d.getFullYear() + dir, 0, 1);
    DP.scrollDone = false;
    this.reload();
  },

  today() {
    DP.date = new Date();
    DP.scrollDone = false;
    return this.reload();
  },

  /* ---------------- data ---------------- */

  range() {
    const d = DP.date;
    if (DP.view === 'year') {
      return { from: DateUtil.toISO(new Date(d.getFullYear(), 0, 1, 0, 0)), to: DateUtil.toISO(new Date(d.getFullYear() + 1, 0, 1)) };
    }
    if (DP.view === 'day') {
      return { from: DateUtil.toISO(DateUtil.addDays(d, -7)), to: DateUtil.toISO(DateUtil.addDays(d, 7)) };
    }
    if (DP.view === 'week') {
      const start = DateUtil.startOfWeek(d);
      return { from: DateUtil.toISO(start), to: DateUtil.toISO(DateUtil.addDays(start, 14)) };
    }
    // month
    return {
      from: DateUtil.toISO(DateUtil.addMonths(d, -1)),
      to: DateUtil.toISO(DateUtil.addDays(DateUtil.addMonths(d, 1), 14))
    };
  },

  async reload() {
    const requestId = ++this.requestId;
    try {
      this.render();
      if (await this.fetchRange(requestId)) this.render();
    } catch (err) {
      if (requestId !== this.requestId) return;
      if (err.status === 401) return App.showLogin();
      App.toast('ERROR: ' + err.message, true);
    }
  },

  requestId: 0,

  async fetchRange(requestId = ++this.requestId) {
    const { from, to } = this.range();
    const fromT = DateUtil.parseISO(from).getTime();
    const toT = DateUtil.parseISO(to).getTime();
    const user = DP.user;
    const data = await API.getEvents(from, to);
    if (requestId !== this.requestId || DP.user !== user) return false;
    for (const [id, ev] of DP.events) {
      const s = new Date(ev.start).getTime();
      const en = new Date(ev.end).getTime();
      if (en >= fromT && s <= toT) DP.events.delete(id);
    }
    for (const ev of data.events) {
      if (!ev) continue;
      DP.events.set(ev.id, ev);
    }
    return true;
  },

  /* ---------------- base render ---------------- */

  tags: [],
  currentTag: null,

  initTags() {
    try {
      const key = 'dp.tags.v1.' + (DP.user ? DP.user.id : 'guest');
      const raw = localStorage.getItem(key) || (DP.user?.role === 'admin' ? localStorage.getItem('dp.tags.v1') : null);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) { this.tags = p.filter(tag => tag && typeof tag.name === 'string' && tag.name.trim()).map((tag, index) => ({ id: typeof tag.id === 'string' ? tag.id : 'legacy-' + index, name: tag.name.slice(0, 40), color: taskColor(tag.color) })); return; } }
    } catch (e) { /* silencioso */ }
    this.tags = [
      { id: 'trabajo', name: 'trabajo', color: '#00ff41' },
      { id: 'personal', name: 'personal', color: '#00ccff' },
      { id: 'estudio', name: 'estudio', color: '#ffff00' }
    ];
    this.saveTags();
  },

  saveTags() {
    try { localStorage.setItem('dp.tags.v1.' + (DP.user ? DP.user.id : 'guest'), JSON.stringify(this.tags)); } catch (e) { /* silencioso */ }
  },

  addTag() {
    const input = document.getElementById('tk-tag-name');
    const name = input.value.trim();
    const color = document.getElementById('tk-tag-color').value;
    const msg = document.getElementById('tk-tag-msg');
    if (!name) { msg.textContent = 'Escribe un nombre para la etiqueta.'; return; }
    if (this.tags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) {
      msg.textContent = 'Ya existe una etiqueta con ese nombre.';
      return;
    }
    const tag = { id: 'tag-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: name.slice(0, 40), color: taskColor(color) };
    this.tags.push(tag);
    this.currentTag = tag;
    this.saveTags();
    this.updateTaskColor();
    this.renderTags();
    input.value = '';
    msg.textContent = '';
  },

  updateTaskColor() {
    if (!this.currentTag) return;
    DP.currentColor = this.currentTag.color;
    App.selectColor(DP.currentColor);
  },

  renderTags() {
    const box = document.getElementById('tk-tags');
    if (!box) return;
    box.innerHTML = '';
    const tags = [...this.tags];
    if (this.currentTag && !tags.some(tag => tag.id === this.currentTag.id)) tags.push(this.currentTag);
    for (const tag of tags) {
      const button = document.createElement('button');
      button.type = 'button';
      const selected = this.currentTag && this.currentTag.id === tag.id;
      button.className = 'tag-chip' + (selected ? ' selected' : '');
      button.style.setProperty('--tagc', tag.color);
      button.setAttribute('aria-pressed', String(Boolean(selected)));
      button.textContent = tag.name;
      button.addEventListener('click', () => {
        this.currentTag = selected ? null : tag;
        this.updateTaskColor();
        this.renderTags();
      });
      box.appendChild(button);
    }
  },

  render() {
    this.resetInteractionState();
    this.syncNavButtons();
    if (DP.view === 'day') this.renderDay();
    if (DP.view === 'week') this.renderWeek();
    if (DP.view === 'month') this.renderMonth();
    if (DP.view === 'year') this.renderYear();
    this.updateNowLines();
  },

  resetInteractionState() {
    DP.suppressClick = false;
    if (!DP.drag) return;
    window.removeEventListener('pointermove', DP.drag.onMove);
    window.removeEventListener('pointerup', DP.drag.onUp);
    window.removeEventListener('pointercancel', DP.drag.onCancel);
    DP.drag = null;
  },

  hourLabels() {
    let out = '<div class="time-gutter">';
    for (let h = 0; h < VISIBLE_HOURS; h++) {
      out += `<div class="hour-label" style="top:${h * PX_PER_HOUR}px">${DateUtil.pad((h + DAY_START_HOUR) % 24)}:00</div>`;
      if (h < VISIBLE_HOURS - 1) {
        out += `<div class="half-label" style="top:${h * PX_PER_HOUR + PX_PER_HOUR / 2}px">${DateUtil.pad((h + DAY_START_HOUR) % 24)}:30</div>`;
      }
    }
    out += '</div>';
    return out;
  },

  buildSlots(dayDate) {
    let out = '';
    for (let i = 0; i < VISIBLE_MINUTES / 30; i++) {
      const start = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), DAY_START_HOUR, i * 30);
      out += `<div class="slot${i % 2 === 0 ? ' hour-slot' : ''}" data-start="${DateUtil.toISO(start)}" style="top:${i * 30}px;height:30px"></div>`;
    }
    return out;
  },

  buildTasks(dayDate) {
    const visStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), DAY_START_HOUR).getTime();
    const visEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate() + 1, DAY_START_HOUR).getTime();
    let out = '';
    let total = 0;
    for (const ev of DP.events.values()) {
      const s = new Date(ev.start).getTime();
      const e = new Date(ev.end).getTime();
      if (e <= visStart || s >= visEnd) continue;
      total++;
      const top = s < visStart ? 0 : this.timelineMinutes(new Date(s), dayDate);
      let height = Math.max(12, (e >= visEnd ? VISIBLE_MINUTES : this.timelineMinutes(new Date(e), dayDate)) - top);
      const color = taskColor(ev.color);
      const clipStart = s < visStart;
      const clipEnd = e > visEnd;
      const titleOnly = e - s === 30 * 60000;
      out += `<div class="task${DP.selectedId === ev.id ? ' selected' : ''}${height <= 40 ? ' mini' : ''}${titleOnly ? ' half-hour' : ''}" data-id="${ev.id}"
        style="top:${top}px;height:${height}px;border-color:${color};box-shadow:0 0 8px ${color}66"
        title="${escHtml(ev.title)} :: ${DateUtil.fTime(new Date(ev.start))} - ${DateUtil.fTime(new Date(ev.end))}">
        <div class="task-title">${!titleOnly && clipStart ? '[CTD] ' : ''}${escHtml(ev.title)}${!titleOnly && clipEnd ? ' [GDK]' : ''}</div>
        ${titleOnly ? '' : `<div class="task-time">${DateUtil.fTime(new Date(ev.start))} - ${DateUtil.fTime(new Date(ev.end))}${ev.urgency ? ` <span class="task-urg u${escHtml(ev.urgency)}">${URG_LABELS[ev.urgency] || escHtml(ev.urgency)}</span>` : ''}</div>`}
        ${!titleOnly && ev.description ? `<div class="task-desc">${mdLite(ev.description)}</div>` : ''}
        ${!titleOnly && ev.urgency ? `<span class="task-urgency lu${escHtml(ev.urgency)}">${URG_LABELS[ev.urgency] || escHtml(ev.urgency)}</span>` : ''}
        <div class="task-grip"></div>
      </div>`;
    }
    return { html: `<div class="tasks-layer">${out}</div>`, count: total };
  },

  timelineMinutes(date, day) {
    const days = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())) / 86400000;
    return days * DAY_MINUTES + DateUtil.minutesOfDay(date) - VISIBLE_START_MIN;
  },

  nowLineHTML(day) {
    const minutes = this.timelineMinutes(new Date(), day);
    return '<div class="now-line" data-now="' + DateUtil.toISO(day) + '" style="top:' + minutes + 'px;display:' + (minutes < 0 || minutes >= VISIBLE_MINUTES ? 'none' : '') + '"></div>';
  },

  updateNowLines() {
    document.querySelectorAll('.now-line[data-now]').forEach((el) => {
      const minutes = this.timelineMinutes(new Date(), DateUtil.parseISO(el.dataset.now));
      el.style.display = minutes < 0 || minutes >= VISIBLE_MINUTES ? 'none' : '';
      el.style.top = minutes + 'px';
    });
  },

  setTitle(left, right) {
    document.getElementById('view-title').innerHTML =
      `<span>&gt; ${left}</span> <span class="dim">${right || ''}</span>`;
  },

  /* ---------------- day view ---------------- */

  renderDay() {
    const d = DateUtil.dayStart(DP.date);
    const tasks = this.buildTasks(d);
    let html = `<div class="day-head"><span class="dim">&gt;</span> ${DateUtil.formatDay(d)} <span class="dim">[${tasks.count} tareas]</span></div>`;
    html += `<div class="day-scroll" id="day-scroll">
      <div class="timeline" style="height:${VISIBLE_MINUTES}px">
        ${this.hourLabels()}
        <div class="slots">${this.buildSlots(d)}</div>
        ${tasks.html}
        ${this.nowLineHTML(d)}
      </div></div>`;
    this.container.innerHTML = html;
    this.setTitle('DIA', DateUtil.formatDay(d));
    this.updateNavScroll('#day-scroll');
  },

  /* ---------------- week view ---------------- */

  renderWeek() {
    const start = DateUtil.startOfWeek(DP.date);
    const today = new Date();
    const days = [];
    let total = 0;
    for (let i = 0; i < 7; i++) days.push(DateUtil.addDays(start, i));

    let head = '<div class="week-head">';
    for (const d of days) {
      const tc = DateUtil.isSameDay(d, today) ? ' today-cell' : '';
      head += `<div class="cell${tc}">${DateUtil.WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} <b>${d.getDate()}</b></div>`;
    }
    head += '</div>';

    let body = `<div class="week-scroll" id="week-scroll"><div class="week-body" style="height:${VISIBLE_MINUTES}px;padding-left:62px">`;
    body += this.hourLabels();
    for (const d of days) {
      const t = this.buildTasks(d);
      total += t.count;
      body += `<div class="week-day">
        <div class="slots">${this.buildSlots(d)}</div>
        ${t.html}
        ${this.nowLineHTML(d)}
      </div>`;
    }
    body += '</div></div>';

    this.container.innerHTML = head + body;

    const label = `${DateUtil.WEEKDAYS_SHORT[0].toLowerCase()} ${days[0].getDate()} - ${DateUtil.WEEKDAYS_SHORT[6].toLowerCase()} ${days[6].getDate()} ${DateUtil.MONTHS_LONG[days[0].getMonth()].toLowerCase()} ${days[0].getFullYear()}`;
    this.setTitle('SEMANA', `${label} :: [${total} tareas]`);
    this.updateNavScroll('#week-scroll');
  },

  /* ---------------- month view ---------------- */

  renderMonth() {
    const year = DP.date.getFullYear();
    const month = DP.date.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = DateUtil.startOfWeek(first);
    const today = new Date();

    let hd = '<div class="month-hd">';
    for (const w of DateUtil.WEEKDAYS_SHORT) hd += `<div>${w}</div>`;
    hd += '</div>';

    let cells = '';
    let total = 0;
    for (let i = 0; i < 42; i++) {
      const d = DateUtil.addDays(gridStart, i);
      const inMonth = d.getMonth() === month;
      const tc = DateUtil.isSameDay(d, today) ? ' today-cell' : '';
      const iso = DateUtil.toISO(DateUtil.dayStart(d));
      const chips = this.chipsForDay(d);
      total += chips.count;
      cells += `<div class="day-cell${inMonth ? '' : ' other-month'}${tc}" data-date="${iso}">
        <div class="day-num">${d.getDate()}</div>
        <div class="day-add" data-date="${iso}" title="Nueva tarea">+</div>
        <div class="day-tasks">${chips.html}</div>
      </div>`;
    }

    this.container.innerHTML = `<div class="month-view">${hd}<div class="month-grid">${cells}</div></div>`;
    this.setTitle('MES', `${DateUtil.MONTHS_LONG[month]} ${year} :: [${total} tareas]`);
  },

  chipsForDay(d) {
    const dayStart = DateUtil.dayStart(d).getTime();
    const dayEnd = DateUtil.addDays(DateUtil.dayStart(d), 1).getTime();
    const list = [];
    for (const ev of DP.events.values()) {
      const s = new Date(ev.start).getTime();
      if (s < dayEnd && new Date(ev.end).getTime() > dayStart) list.push(ev);
    }
    list.sort((a, b) => a.start.localeCompare(b.start));
    const shown = list.slice(0, 3);
    let html = '';
    for (const ev of shown) {
      html += `<div class="task-chip" data-id="${ev.id}" title="${escHtml(ev.title)}">${DateUtil.fTime(new Date(ev.start))} ${escHtml(ev.title)}</div>`;
    }
    if (list.length > 3) html += `<div class="task-chip" style="opacity:.7">+${list.length - 3} mas</div>`;
    return { html, count: list.length };
  },

  /* ---------------- year view ---------------- */

  renderYear() {
    const year = DP.date.getFullYear();
    const today = new Date();

    const hasTask = new Set();
    let grandTotal = 0;
    for (const ev of DP.events.values()) {
      const d = new Date(ev.start);
      const end = new Date(ev.end);
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      if (d >= yearEnd || end <= yearStart) continue;
      grandTotal++;
      for (let day = DateUtil.dayStart(d < yearStart ? yearStart : d); day < end && day < yearEnd; day = DateUtil.addDays(day, 1)) {
        hasTask.add(DateUtil.toISO(day).slice(0, 10));
      }
    }

    let html = '<div class="year-view">';
    for (let m = 0; m < 12; m++) {
      const monthCount = this.countInMonth(year, m);
      let grid = '';
      const dims = new Date(year, m + 1, 0).getDate();
      const firstDow = (new Date(year, m, 1).getDay() + 6) % 7;
      for (let pad = 0; pad < firstDow; pad++) grid += '<div></div>';
      for (let day = 1; day <= dims; day++) {
        const key = `${year}-${DateUtil.pad(m + 1)}-${DateUtil.pad(day)}`;
        const classes = ['mini-day'];
        if (hasTask.has(key)) classes.push('has-task');
        if (DateUtil.isSameDay(new Date(year, m, day), today)) classes.push('today');
        grid += `<div class="${classes.join(' ')}" data-date="${DateUtil.toISO(new Date(year, m, day, 0, 0))}">${day}</div>`;
      }
      html += `<div class="month-card">
        <div class="month-title" data-date="${DateUtil.toISO(new Date(year, m, 1))}">${DateUtil.MONTHS_LONG[m]}</div>
        <div class="mini-grid">${grid}</div>
        <div class="month-count"><b>${monthCount}</b> tarea${monthCount === 1 ? '' : 's'}</div>
      </div>`;
    }
    html += '</div>';

    this.container.innerHTML = html;
    this.setTitle('A&Ntilde;O', `${year} :: [${grandTotal} tareas]`);
  },

  countInMonth(year, month) {
    let n = 0;
    for (const ev of DP.events.values()) {
      const d = new Date(ev.start);
      if (d < new Date(year, month + 1, 1) && new Date(ev.end) > new Date(year, month, 1)) n++;
    }
    return n;
  },

  /* ---------------- interactions ---------------- */

  bindContainer() {
    const c = this.container;

    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    c.addEventListener('click', (e) => {
      if (DP.suppressClick) { DP.suppressClick = false; return; }

      const task = e.target.closest('.task');
      if (task) {
        DP.selectedId = task.dataset.id;
        this.clearSelection();
        const el = document.querySelector(`.task[data-id="${task.dataset.id}"]`);
        if (el) el.classList.add('selected');
        return;
      }

      const chip = e.target.closest('.task-chip');
      if (chip && chip.dataset.id) {
        App.openEditTask(chip.dataset.id);
        return;
      }

      const add = e.target.closest('.day-add');
      if (add) {
        const day = DateUtil.parseISO(add.dataset.date);
        App.openNewTask(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0));
        return;
      }

      const cell = e.target.closest('.day-cell');
      if (cell && cell.dataset.date) {
        this.goToDay(cell.dataset.date);
        return;
      }

      const miniDay = e.target.closest('.mini-day');
      if (miniDay && miniDay.dataset.date) {
        this.goToDay(miniDay.dataset.date);
        return;
      }

      const miniTitle = e.target.closest('.month-title');
      if (miniTitle && miniTitle.dataset.date) {
        DP.date = DateUtil.parseISO(miniTitle.dataset.date);
        DP.scrollDone = false;
        this.setView('month');
        return;
      }

      const slot = e.target.closest('.slot');
      if (slot && slot.dataset.start) {
        const start = DateUtil.snap30(DateUtil.parseISO(slot.dataset.start));
        App.openNewTask(new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()));
      }
    });

    c.addEventListener('dblclick', (e) => {
      const task = e.target.closest('.task');
      if (task) {
        e.preventDefault();
        App.openEditTask(task.dataset.id);
      }
    });

    window.addEventListener('resize', () => this.updateNowLines());
    setInterval(() => this.updateNowLines(), 30000);
  },

  goToDay(iso) {
    DP.date = DateUtil.parseISO(iso);
    DP.scrollDone = false;
    if (DP.view === 'day') this.reload();
    else this.setView('day');
  },

  clearSelection() {
    document.querySelectorAll('.task.selected').forEach((el) => el.classList.remove('selected'));
  },

  onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (DP.drag) this.resetInteractionState();
    const grip = e.target.closest('.task-grip');
    const task = e.target.closest('.task');
    if (!task) return;

    const ev = DP.events.get(task.dataset.id);
    if (!ev) return;

    e.preventDefault();
    const min = Math.round(parseFloat(task.style.top) || 0);
    const span = Math.round(parseFloat(task.style.height) || 30);

    DP.drag = {
      id: ev.id,
      mode: grip ? 'resize' : 'move',
      startClientY: e.clientY,
      origStart: new Date(ev.start).getTime(),
      origEnd: new Date(ev.end).getTime(),
      min,
      span,
      lastDelta: 0,
      pointerType: e.pointerType,
      onMove: null,
      onUp: null
    };

    task.classList.add('selected');
    DP.selectedId = ev.id;

    const onMove = (me) => this.dragMove(me.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      this.dragEnd();
    };
    const onCancel = () => {
      this.resetInteractionState();
      this.render();
    };
    DP.drag.onMove = onMove;
    DP.drag.onUp = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    DP.drag.onCancel = onCancel;
  },

  dragMove(clientY) {
    const d = DP.drag;
    if (!d) return;
    d.lastDelta = clientY - d.startClientY;
    const el = document.querySelector(`.task[data-id="${d.id}"]`);
    if (!el) return;

    if (d.mode === 'resize') {
      const endMin = Math.max(snap30(d.min + d.span + d.lastDelta), d.min + 30);
      el.style.height = Math.max(endMin - d.min, 12) + 'px';
    } else {
      const newTop = Math.max(0, snap30(d.min + d.lastDelta));
      el.style.top = newTop + 'px';
      el.style.height = d.span + 'px';
    }
  },

  dragEnd() {
    const d = DP.drag;
    if (!d) return;
    DP.drag = null;

    const el = document.querySelector(`.task[data-id="${d.id}"]`);
    const moved = Math.abs(d.lastDelta) >= 3;
    DP.suppressClick = moved;

    if (el) {
      el.style.top = d.min + 'px';
      el.style.height = d.span + 'px';
    }
    if (!moved) {
      if (d.pointerType === 'touch') App.openEditTask(d.id);
      return;
    }

    let startT = d.origStart;
    let endT = d.origEnd;

    if (d.mode === 'resize') {
      endT = Math.max(d.origStart + 30 * 60000, d.origEnd + snap30(d.lastDelta) * 60000);
    } else {
      const deltaMin = Math.max(0, snap30(d.min + d.lastDelta)) - d.min;
      startT = d.origStart + deltaMin * 60000;
      const durMin = (d.origEnd - d.origStart) / 60000;
      endT = startT + durMin * 60000;
    }

    if (endT <= startT) endT = startT + 30 * 60000;
    this.commitMove(d.id, startT, endT);
  },

  async commitMove(id, startT, endT) {
    try {
      const ev = DP.events.get(id);
      const newStart = DateUtil.toISO(new Date(startT));
      const newEnd = DateUtil.toISO(new Date(endT));
      if (ev && DateUtil.parseISO(ev.start).getTime() === startT && DateUtil.parseISO(ev.end).getTime() === endT) return;
      await API.updateEvent(id, { start: newStart, end: newEnd });
      await this.reload();
    } catch (err) {
      App.toast('ERROR: ' + err.message, true);
    }
  },

  updateNavScroll(sel) {
    const scroller = document.querySelector(sel);
    if (!scroller) return;
    if (DP.view !== 'day') return;
    if (DP.scrollDone) return;
    const now = new Date();
    const minutes = this.timelineMinutes(now, DP.date);
    if (minutes >= 0 && minutes < VISIBLE_MINUTES) {
      DP.scrollDone = true;
      scroller.scrollTop = Math.max(0, minutes - 240);
    }
  }
};

/* ---------------- helpers ---------------- */

function snap30(min) {
  return Math.round(min / 30) * 30;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
