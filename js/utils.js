/* ============================================================
   utils.js — shared helpers (dates, formatting, DOM, colors)
   ============================================================ */
window.U = (function () {
  const CFG = window.CONFIG;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // ---- DOM ----
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  // ---- Formatting ----
  const fmtNum = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(CFG.LOCALE);
  const fmtHours = (n) => {
    const v = Math.round((Number(n) || 0) * 10) / 10;
    return `${v.toLocaleString(CFG.LOCALE)}h`;
  };
  const fmtShort = (n) => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n * 10) / 10);
  };

  // ---- Dates ----
  // Parse "01-Jul-2026", "2026-07-01", "1/7/2026", ISO, etc. -> Date (local, midnight)
  function parseDate(input) {
    if (input instanceof Date) return startOfDay(input);
    if (input == null) return null;
    const s = String(input).trim();
    if (!s) return null;

    // dd-Mon-yyyy  e.g. 01-Jul-2026
    let m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
    if (m) {
      const mi = MONTHS_SHORT.findIndex(x => x.toLowerCase() === m[2].slice(0,3).toLowerCase());
      if (mi >= 0) return new Date(+m[3], mi, +m[1]);
    }
    // yyyy-mm-dd
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3]);
    // dd/mm/yyyy  (assume day-first, common in IN)
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);

    const d = new Date(s);
    return isNaN(d) ? null : startOfDay(d);
  }

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const isoDate    = (d) => { const x = startOfDay(d); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; };
  const pad        = (n) => String(n).padStart(2, '0');
  const sameDay    = (a,b) => a && b && isoDate(a) === isoDate(b);

  // ISO week: Monday as start
  function startOfWeek(d) {
    const x = startOfDay(d);
    const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
    x.setDate(x.getDate() - day);
    return x;
  }
  const endOfWeek = (d) => { const x = startOfWeek(d); x.setDate(x.getDate()+6); return x; };
  const addDays   = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const daysInMonth = (y,m) => new Date(y, m+1, 0).getDate();
  const daysBetween = (a,b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

  const fmtDayLabel = (d) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const relativeDay = (d) => {
    const today = startOfDay(new Date());
    const diff = Math.round((today - startOfDay(d)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return `${diff} days ago`;
    return `${fmtDayLabel(d)}, ${d.getFullYear()}`;
  };

  // ---- Colors ----
  const PALETTE = ['#5b93ff','#a970ff','#2fd980','#ffb02e','#ff5d73','#22d3ee','#f472b6','#84cc16','#fb923c','#38bdf8'];
  const colorFor = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };

  // subject -> config entry (case-insensitive), else a derived colour
  const subjectMeta = (name) => {
    const key = String(name || '').trim().toLowerCase();
    const found = (CFG.SUBJECTS || []).find(s => s.key === key || s.label.toLowerCase() === key);
    return found || { key, label: name, color: colorFor(String(name)), max: 50 };
  };
  const subjectColor = (name) => subjectMeta(name).color;

  const subjEmoji = (name) => {
    const map = { quant:'🔢', reasoning:'🧩', english:'📖', ga:'🌐',
      'general awareness':'🌐', 'current affairs':'📰', revision:'🔁',
      maths:'🔢', math:'🔢', gk:'🌐', aptitude:'🔢', verbal:'📖' };
    return map[String(name).toLowerCase()] || '📚';
  };

  // ---- misc ----
  const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const sum = (arr) => arr.reduce((s, x) => s + (Number(x) || 0), 0);
  const avg = (arr) => arr.length ? sum(arr) / arr.length : 0;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  return {
    MONTHS, MONTHS_SHORT, DOW, PALETTE,
    $, $$, el,
    fmtNum, fmtHours, fmtShort,
    parseDate, startOfDay, isoDate, pad, sameDay,
    startOfWeek, endOfWeek, addDays, daysInMonth, daysBetween,
    fmtDayLabel, relativeDay,
    colorFor, subjectMeta, subjectColor, subjEmoji,
    debounce, clamp, sum, avg, cssVar, toast,
  };
})();
