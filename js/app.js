/* ============================================================
   app.js — bootstrap & orchestration
   ------------------------------------------------------------
   Flow:
     1. init theme + charts + event listeners
     2. DataStore.load() -> data arrives -> rebuild()
     3. any UI change -> rerender() (recomputes context, redraws)
   ============================================================ */
(function () {
  const CFG = window.CONFIG;
  const state = {
    period: 'monthly',
    refDate: U.startOfDay(new Date()),
  };

  // ---------- Build the view context ----------
  function buildContext() {
    const allStudy = Filters.apply(DataStore.data.study);  // subject/search/sort applied
    const allMocks = DataStore.data.mocks;
    const range = Agg.periodRange(state.refDate, state.period);
    return {
      allStudy,
      periodStudy: Agg.filterRange(allStudy, range.start, range.end),
      allMocks,
      periodMocks: Agg.filterRange(allMocks, range.start, range.end),
      refDate: state.refDate,
      period: state.period,
      range,
    };
  }

  // ---------- Adaptive summary cards ----------
  function computeSummary(ctx) {
    const p = state.period;
    const hours = Agg.totalHours(ctx.periodStudy);
    const activeDays = new Set(ctx.periodStudy.map(s => U.isoDate(s.date))).size;
    const span = p === 'daily' ? 1 : (U.daysBetween(ctx.range.start, ctx.range.end) + 1);
    const perDay = hours / span;
    const mocksN = ctx.periodMocks.length;

    // best mock score in period (or latest overall as fallback context)
    const periodBest = ctx.periodMocks.reduce((a, m) => m.total > (a ? a.total : -1) ? m : a, null);
    const clearedN = ctx.periodMocks.filter(m => m.total >= m.cutoff).length;
    const topSubj = Agg.bySubject(ctx.periodStudy)[0];

    return [
      { accent:'blue',   icon:'📚', label: labelFor(p, 'Hours'), value: hours, format:'hours',
        sub: ctx.range.label },
      { accent:'purple', icon:'⏱️', label:'Avg / Day', value: perDay, format:'hours',
        sub: perDay >= CFG.DAILY_HOURS_GOAL ? `≥ ${CFG.DAILY_HOURS_GOAL}h goal ✓` : `goal ${CFG.DAILY_HOURS_GOAL}h`,
        danger: perDay < CFG.DAILY_HOURS_GOAL * 0.6 },
      { accent:'green',  icon:'📝', label:'Mocks Attempted', value: mocksN, format:'score',
        sub: mocksN ? `${clearedN}/${mocksN} cleared cutoff` : (topSubj ? `top: ${topSubj.name}` : 'none yet') },
      { accent:'amber',  icon: periodBest ? (periodBest.total>=periodBest.cutoff?'🏆':'🎯') : '🎯',
        label:'Best Mock Score', value: periodBest ? periodBest.total : 0, format:'score', suffix:`/${Agg.maxTotal()}`,
        sub: periodBest ? (periodBest.total>=periodBest.cutoff?`+${periodBest.total-periodBest.cutoff} vs cutoff`:`−${periodBest.cutoff-periodBest.total} vs cutoff`) : '—',
        danger: periodBest && periodBest.total < periodBest.cutoff },
    ];
  }
  const labelFor = (p, w) => ({ daily:`${w} Today`, weekly:`${w} This Week`, monthly:`${w} This Month`, yearly:`${w} This Year` }[p] || w);

  // ---------- Recompute + redraw ----------
  function rerender() {
    const ctx = buildContext();
    const cd = Agg.countdown(DataStore.data.study);

    UI.renderCountdown(cd);
    UI.updateCards(computeSummary(ctx));

    // Mock hero: best mock in current period, else latest overall
    const heroMock = ctx.periodMocks.length
      ? ctx.periodMocks.reduce((a, m) => m.total > (a ? a.total : -1) ? m : a, null)
      : (ctx.allMocks.length ? ctx.allMocks[ctx.allMocks.length - 1] : null);
    UI.setMockHero(heroMock);

    UI.renderInsights(Agg.insights(ctx.allStudy, ctx.allMocks, state.refDate, state.period, cd));

    Charts.render(ctx);
    UI.renderMockTimeline(ctx.allMocks);
    UI.renderStudyList(ctx.allStudy);
    UI.renderCalendar(ctx.allStudy, state.refDate);
  }

  // ---------- Full rebuild when new data lands ----------
  function rebuild() {
    // In sheet mode the exam settings travel with the data — apply them.
    if (DataStore.data.settings) Settings.applyExam(DataStore.data.settings);
    const subs = [...new Set(DataStore.data.study.map(s => s.subject))].sort();
    UI.buildSubjectFilter(subs, U.debounce(rerender, 60));
    UI.syncSubjectChecks();
    rerender();
    UI.hideLoader();
  }

  // ---------- Wire events ----------
  function bindEvents() {
    U.$$('#periodSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        U.$$('#periodSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.period = btn.dataset.period;
        rerender();
      });
    });

    const dateInput = U.$('#refDate');
    dateInput.value = U.isoDate(state.refDate);
    dateInput.addEventListener('change', () => {
      const d = U.parseDate(dateInput.value);
      if (d) { state.refDate = d; rerender(); }
    });

    U.$('#themeToggle').addEventListener('click', () => UI.toggleTheme(() => {
      const ctx = buildContext();
      Charts.render(ctx);
      UI.renderCalendar(ctx.allStudy, state.refDate);
    }));

    U.$('#searchInput').addEventListener('input', U.debounce((e) => {
      Filters.state.search = e.target.value.trim();
      rerender();
    }, 200));

    U.$('#sortSelect').addEventListener('change', (e) => { Filters.state.sort = e.target.value; rerender(); });

    U.$('#clearFilters').addEventListener('click', () => {
      Filters.reset();
      U.$('#searchInput').value = '';
      U.$('#sortSelect').value = 'newest';
      UI.syncSubjectChecks();
      rerender();
    });

    U.$('#categoryToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      U.$('#categoryPanel').classList.toggle('open');
    });

    U.$('#exportBtn').addEventListener('click', (e) => { e.stopPropagation(); U.$('#exportDropdown').classList.toggle('open'); });
    U.$$('#exportDropdown button').forEach(b => {
      b.addEventListener('click', () => {
        U.$('#exportDropdown').classList.remove('open');
        const ctx = buildContext();
        const kind = b.dataset.export;
        if (kind === 'csv') Exporter.csv(ctx.allMocks);
        else if (kind === 'png') Exporter.png();
        else if (kind === 'pdf') Exporter.pdf({ label: `${ctx.range.label}` });
      });
    });

    document.addEventListener('click', () => {
      U.$('#categoryPanel').classList.remove('open');
      U.$('#exportDropdown').classList.remove('open');
    });

    window.addEventListener('resize', U.debounce(() => Charts.resize(), 150));
  }

  // ---------- Boot ----------
  function boot() {
    Settings.applyBootstrap();                                   // point CONFIG at local | sheet
    if (Settings.storageMode() === 'local') Settings.applyLocalExam();
    UI.initTheme();
    Charts.init();
    Forms.init();
    bindEvents();

    DataStore.onUpdate(() => {
      UI.setStatus(Forms.statusText(), Settings.storageMode() === 'sheet' ? 'live' : '');
      rebuild();
    });

    DataStore.load().then(() => {
      // First run (or no exam date set yet): ask for the exam date.
      if (!CONFIG.EXAM_DATE) Forms.openSettings(true);
    });
    DataStore.startPolling();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
