/* ============================================================
   ui.js — cards, count-up, countdown, mock hero, insights,
           mock timeline, study calendar, theme, subject filter
   ============================================================ */
window.UI = (function () {
  const CFG = window.CONFIG;

  // ---------- Count-up animation ----------
  function countUp(elm, to, { prefix = '', suffix = '', decimals = 0 } = {}) {
    const from = Number(elm._val || 0);
    to = Number(to) || 0;
    elm._val = to;
    const dur = 700, t0 = performance.now();
    elm.classList.add('flash');
    setTimeout(() => elm.classList.remove('flash'), 600);
    const fmt = (v) => Number(v).toLocaleString(CFG.LOCALE, { maximumFractionDigits: decimals });
    function step(now) {
      const p = U.clamp((now - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (to - from) * eased;
      elm.textContent = prefix + fmt(val) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------- Countdown hero ----------
  function renderCountdown(cd) {
    const box = U.$('#countdown');
    if (!box) return;
    U.$('#cdExamName').textContent = cd.name;
    if (cd.exam) {
      U.$('#cdExamDate').textContent = `${U.fmtDayLabel(cd.exam)} ${cd.exam.getFullYear()}`;
    } else {
      U.$('#cdExamDate').textContent = 'Set EXAM_DATE in config.js';
    }
    const big = U.$('#cdDays');
    if (cd.daysLeft == null) { big.textContent = '—'; }
    else if (cd.daysLeft >= 0) { countUp(big, cd.daysLeft); }
    else { big.textContent = 'Done'; }
    U.$('#cdDaysLabel').textContent = cd.daysLeft != null && cd.daysLeft >= 0
      ? (cd.daysLeft === 1 ? 'day to go' : 'days to go') : 'exam passed';
    U.$('#cdWeeks').textContent = cd.weeksLeft != null ? `${cd.weeksLeft} weeks` : '—';

    // urgency colouring
    box.setAttribute('data-urgency',
      cd.daysLeft == null ? 'none' : cd.daysLeft <= 14 ? 'high' : cd.daysLeft <= 30 ? 'med' : 'low');

    // prep progress bar
    const fill = U.$('#cdFill');
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = U.clamp(cd.progress, 0, 100) + '%'; });
    U.$('#cdProgress').textContent = `${cd.progress}% of prep window elapsed`;
    U.$('#cdElapsed').textContent = cd.exam ? `${cd.elapsed} / ${cd.totalSpan} days` : '';
  }

  // ---------- Summary cards (generic, adaptive) ----------
  function updateCards(cards) {
    cards.forEach((c, i) => {
      const n = i + 1;
      U.$('#card' + n).setAttribute('data-accent', c.accent);
      U.$('#cardIcon' + n).textContent = c.icon;
      U.$('#cardLabel' + n).textContent = c.label;
      U.$('#cardSub' + n).textContent = c.sub || '';
      const opts = c.format === 'hours'   ? { suffix: 'h', decimals: 1 }
                 : c.format === 'percent' ? { suffix: '%' }
                 : c.format === 'score'   ? { suffix: c.suffix || '', decimals: 2 }
                 : {};
      const valEl = U.$('#cardValue' + n);
      countUp(valEl, c.value, opts);
      valEl.style.color = c.danger ? U.cssVar('--accent-red') : '';
    });
  }

  // ---------- Latest / selected mock vs cutoff hero ----------
  function setMockHero(mock) {
    const box = U.$('#mockHero');
    if (!mock) { box.hidden = true; return; }
    box.hidden = false;
    const maxT = Agg.maxTotal();
    const cleared = mock.total >= mock.cutoff;
    U.$('#mhName').textContent = mock.name;
    U.$('#mhDate').textContent = `${U.fmtDayLabel(mock.date)} ${mock.date.getFullYear()}`;
    U.$('#mhScore').textContent = mock.total;
    U.$('#mhOutOf').textContent = `/ ${maxT}`;
    U.$('#mhCutoff').textContent = mock.cutoff;
    const pct = maxT > 0 ? U.clamp(Math.round(mock.total / maxT * 100), 0, 100) : 0;
    const cutPct = maxT > 0 ? U.clamp(mock.cutoff / maxT * 100, 0, 100) : 0;
    const fill = U.$('#mhFill');
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = pct + '%'; });
    fill.classList.toggle('over', !cleared);
    U.$('#mhCutMark').style.left = cutPct + '%';
    const badge = U.$('#mhBadge');
    badge.textContent = cleared ? `✅ Cleared by ${mock.total - mock.cutoff}` : `❌ Short by ${mock.cutoff - mock.total}`;
    badge.className = 'mh-badge ' + (cleared ? 'good' : 'bad');
    // subject chips
    const chips = U.$('#mhSubjects'); chips.innerHTML = '';
    (CFG.SUBJECTS || []).forEach(s => {
      const v = mock.scores[s.key] || 0;
      const chip = U.el('span', 'mh-chip');
      chip.innerHTML = `<span class="mh-dot" style="background:${s.color}"></span>${s.label} <b>${v}</b><span class="mh-max">/${s.max}</span>`;
      chips.appendChild(chip);
    });
  }

  // ---------- Insights ----------
  function renderInsights(list) {
    const track = U.$('#insightsTrack');
    track.innerHTML = '';
    list.forEach((it, i) => {
      const chip = U.el('div', `insight-chip ${it.kind || ''}`);
      chip.style.animationDelay = (i * 0.05) + 's';
      chip.innerHTML = `<span class="em">${it.emoji}</span><span class="tx">${it.text}</span>`;
      track.appendChild(chip);
    });
  }

  // ---------- Mock timeline (with delete) ----------
  function renderMockTimeline(mocks) {
    const box = U.$('#timeline');
    box.innerHTML = '';
    const rows = mocks.slice().sort((a,b) => b.date - a.date).slice(0, 100);
    const maxT = Agg.maxTotal();
    if (!rows.length) { box.innerHTML = emptyState('📝', 'No mocks yet', 'Click “＋ Add Mock” to record a mock score.'); return; }
    rows.forEach(m => {
      const cleared = m.total >= m.cutoff;
      const item = U.el('div', 'tl-item');
      item.innerHTML =
        `<span class="tl-badge ${cleared?'ok':'bad'}">${cleared?'✓':'✕'}</span>
         <span class="tl-main">
           <span class="tl-cat">${escapeHtml(m.name)}</span>
           <span class="tl-date2">${U.fmtDayLabel(m.date)} · cutoff ${m.cutoff}</span>
         </span>
         <span class="tl-amt ${cleared?'':'high'}">${m.total}<span class="tl-out">/${maxT}</span></span>
         <button class="row-del" data-del-mock="${m.id}" title="Delete mock">✕</button>`;
      box.appendChild(item);
    });
  }

  // ---------- Recent study sessions (with delete) ----------
  function renderStudyList(study) {
    const box = U.$('#studyList');
    if (!box) return;
    box.innerHTML = '';
    const rows = study.slice().sort((a,b) => b.date - a.date).slice(0, 100);
    if (!rows.length) { box.innerHTML = emptyState('📚', 'No study logged', 'Click “＋ Log Study” to add your first session.'); return; }
    rows.forEach(s => {
      const item = U.el('div', 'tl-item');
      item.innerHTML =
        `<span class="tl-badge subj" style="background:${U.subjectColor(s.subject)}">${U.subjEmoji(s.subject)}</span>
         <span class="tl-main">
           <span class="tl-cat">${escapeHtml(s.subject)}</span>
           <span class="tl-date2">${U.relativeDay(s.date)}</span>
         </span>
         <span class="tl-amt hours">${U.fmtHours(s.hours)}</span>
         <button class="row-del" data-del-study="${s.id}" title="Delete session">✕</button>`;
      box.appendChild(item);
    });
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const emptyState = (emoji, title, hint) =>
    `<div class="empty-state"><span class="es-emoji">${emoji}</span><span class="es-title">${title}</span><span class="es-hint">${hint}</span></div>`;

  // ---------- Study calendar (hours heatmap) ----------
  function renderCalendar(study, refDate) {
    const { cells, monthLabel } = Agg.monthGrid(study, refDate);
    U.$('#calMonthLabel').textContent = monthLabel;
    const wrap = U.$('#spendCalendar');
    wrap.innerHTML = '';
    U.DOW.forEach(d => wrap.appendChild(U.el('div','cal-dow',d)));
    const today = U.startOfDay(new Date());
    const goal = CFG.DAILY_HOURS_GOAL || 6;
    cells.forEach(c => {
      if (!c) { wrap.appendChild(U.el('div','cal-cell empty')); return; }
      const studied = c.hours > 0;
      const cell = U.el('div', 'cal-cell' + (studied ? ' spent' : '') + (U.sameDay(c.date, today) ? ' today' : ''));
      if (studied) {
        const intensity = U.clamp(c.hours / Math.max(goal, c.max || 1), 0.16, 1);
        const accent = c.hours >= goal ? 'var(--accent-green)' : 'var(--accent-blue)';
        cell.style.background = `color-mix(in srgb, ${accent} ${Math.round(intensity*60)}%, var(--surface-strong))`;
      }
      cell.innerHTML = `<span class="cal-day">${c.day}</span>${studied?`<span class="cal-amt">${U.fmtShort(c.hours)}h</span>`:''}`;
      if (studied) cell.title = `${U.fmtDayLabel(c.date)}: ${U.fmtHours(c.hours)}`;
      wrap.appendChild(cell);
    });
  }

  // ---------- Subject multiselect ----------
  function buildSubjectFilter(subjects, onChange) {
    const panel = U.$('#categoryPanel');
    panel.innerHTML = '';
    subjects.forEach(sub => {
      const item = U.el('label', 'ms-item');
      item.innerHTML = `<input type="checkbox" value="${sub}"><span class="ms-dot" style="background:${U.subjectColor(sub)}"></span>${sub}`;
      item.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) Filters.state.subjects.add(sub);
        else Filters.state.subjects.delete(sub);
        updateSubjectLabel();
        onChange();
      });
      panel.appendChild(item);
    });
    updateSubjectLabel();
  }
  function updateSubjectLabel() {
    const n = Filters.state.subjects.size;
    U.$('#categoryToggle').textContent = n === 0 ? 'All subjects' : `${n} selected`;
  }
  function syncSubjectChecks() {
    U.$$('#categoryPanel input').forEach(i => i.checked = Filters.state.subjects.has(i.value));
    updateSubjectLabel();
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem(CFG.THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }
  function toggleTheme(after) {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(CFG.THEME_KEY, next);
    document.querySelector('meta[name=theme-color]').setAttribute('content', next==='dark'?'#05070f':'#eef2fb');
    if (after) after();
  }

  function setStatus(text, kind) {
    const s = U.$('#dataStatus');
    s.textContent = text;
    s.className = 'data-status' + (kind ? ' ' + kind : '');
  }
  const hideLoader = () => U.$('#loader').classList.add('hide');

  return {
    countUp, renderCountdown, updateCards, setMockHero, renderInsights,
    renderMockTimeline, renderStudyList, renderCalendar,
    buildSubjectFilter, syncSubjectChecks, updateSubjectLabel,
    initTheme, toggleTheme, setStatus, hideLoader,
  };
})();
