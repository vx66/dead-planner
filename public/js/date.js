'use strict';

const DateUtil = {
  pad(n) {
    return String(n).padStart(2, '0');
  },

  // local ISO without seconds, e.g. 2026-09-24T10:00
  toISO(d) {
    return `${d.getFullYear()}-${DateUtil.pad(d.getMonth() + 1)}-${DateUtil.pad(d.getDate())}T${DateUtil.pad(d.getHours())}:${DateUtil.pad(d.getMinutes())}`;
  },

  // parse local ISO string into a Date (manual, avoids UTC pitfalls of Date(str))
  parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return isNaN(d.getTime()) || d.getFullYear() !== Number(m[1]) ||
      d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3]) ||
      d.getHours() !== Number(m[4] || 0) || d.getMinutes() !== Number(m[5] || 0) ||
      d.getSeconds() !== Number(m[6] || 0) ? null : d;
  },

  dayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  },

  addDays(d, n) {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  },

  addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  },

  // Monday-start week
  startOfWeek(d) {
    const s = DateUtil.dayStart(d);
    const weekDay = (s.getDay() + 6) % 7; // 0 = Monday
    return DateUtil.addDays(s, -weekDay);
  },

  isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  },

  minutesOfDay(d) {
    return d.getHours() * 60 + d.getMinutes();
  },

  snap30(d) {
    const mins = DateUtil.minutesOfDay(d);
    const snapped = Math.round(mins / 30) * 30;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(snapped / 60), snapped % 60, 0, 0);
  },

  fTime(d) {
    return `${DateUtil.pad(d.getHours())}:${DateUtil.pad(d.getMinutes())}`;
  },

  WEEKDAYS_SHORT: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'],
  MONTHS_LONG: ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'],

  DOW_LONG: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],

  formatDay(d) {
    return `${DateUtil.DOW_LONG[d.getDay()]} ${d.getDate()} ${DateUtil.MONTHS_LONG[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = DateUtil;
