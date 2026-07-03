/* ============================================================
   aggregations.js — pure analytics functions
   ------------------------------------------------------------
   study : [{date:Date, subject, hours}]
   mocks : [{date:Date, name, scores:{key:val}, total, cutoff}]
   ============================================================ */
window.Agg = (function () {
  const CFG = window.CONFIG;

  // ---- Period window ----
  function periodRange(refDate, period) {
    const d = U.startOfDay(refDate);
    switch (period) {
      case 'daily':
        return { start: d, end: d, label: `${U.fmtDayLabel(d)} ${d.getFullYear()}` };
      case 'weekly': {
        const s = U.startOfWeek(d), e = U.endOfWeek(d);
        return { start: s, end: e, label: `${U.fmtDayLabel(s)} – ${U.fmtDayLabel(e)}` };
      }
      case 'yearly':
        return { start: new Date(d.getFullYear(),0,1), end: new Date(d.getFullYear(),11,31), label: String(d.getFullYear()) };
      case 'monthly':
      default:
        return { start: new Date(d.getFullYear(), d.getMonth(), 1),
                 end: new Date(d.getFullYear(), d.getMonth()+1, 0),
                 label: `${U.MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    }
  }
  const filterRange = (rows, start, end) => rows.filter(r => r.date >= start && r.date <= end);

  // ============================================================
  //  COUNTDOWN
  // ============================================================
  function countdown(study) {
    const today = U.startOfDay(new Date());
    const exam = U.parseDate(CFG.EXAM_DATE);
    const prepStart = U.parseDate(CFG.PREP_START) ||
      (study.length ? study[0].date : today);
    const daysLeft = exam ? U.daysBetween(today, exam) : null;
    const totalSpan = exam ? Math.max(1, U.daysBetween(prepStart, exam)) : 1;
    const elapsed = exam ? U.clamp(U.daysBetween(prepStart, today), 0, totalSpan) : 0;
    const progress = exam ? Math.round(elapsed / totalSpan * 100) : 0;
    const weeksLeft = daysLeft != null ? Math.max(0, Math.floor(daysLeft / 7)) : null;
    return { exam, prepStart, today, daysLeft, weeksLeft, progress, totalSpan, elapsed,
             name: CFG.EXAM_NAME };
  }

  // ============================================================
  //  STUDY
  // ============================================================
  const totalHours = (study) => U.sum(study.map(s => s.hours));

  function bySubject(study) {
    const map = new Map();
    study.forEach(s => map.set(s.subject, (map.get(s.subject) || 0) + s.hours));
    return Array.from(map, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }

  // hours per day across a range (fills gaps with 0)
  function dailyHours(study, start, end) {
    const map = new Map();
    study.forEach(s => { const k = U.isoDate(s.date); map.set(k, (map.get(k) || 0) + s.hours); });
    const out = [];
    for (let d = new Date(start); d <= end; d = U.addDays(d, 1)) {
      const k = U.isoDate(d);
      out.push({ date: new Date(d), key: k, value: map.get(k) || 0 });
    }
    return out;
  }

  // trend by month (yearly/monthly) or by day of month (daily/weekly)
  function studyTrend(allStudy, refDate, period) {
    if (period === 'yearly' || period === 'monthly') {
      const year = U.startOfDay(refDate).getFullYear();
      const totals = new Array(12).fill(0);
      allStudy.forEach(s => { if (s.date.getFullYear() === year) totals[s.date.getMonth()] += s.hours; });
      return { labels: U.MONTHS_SHORT.slice(), values: totals.map(v => Math.round(v*10)/10), unit: 'month' };
    }
    const wStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const wEnd = new Date(refDate.getFullYear(), refDate.getMonth()+1, 0);
    const series = dailyHours(filterRange(allStudy, wStart, wEnd), wStart, wEnd);
    return { labels: series.map(s => s.date.getDate()), values: series.map(s => Math.round(s.value*10)/10), unit: 'day' };
  }

  // consecutive-day study streak ending today (or most recent)
  function studyStreak(allStudy) {
    if (!allStudy.length) return { current: 0, best: 0 };
    const days = new Set(allStudy.map(s => U.isoDate(s.date)));
    const today = U.startOfDay(new Date());
    let current = 0;
    // allow streak to count from today or yesterday
    let cursor = days.has(U.isoDate(today)) ? today : U.addDays(today, -1);
    while (days.has(U.isoDate(cursor))) { current++; cursor = U.addDays(cursor, -1); }
    // best streak
    const sorted = Array.from(days).sort();
    let best = 0, run = 0, prev = null;
    sorted.forEach(k => {
      const d = U.parseDate(k);
      if (prev && U.daysBetween(prev, d) === 1) run++; else run = 1;
      best = Math.max(best, run); prev = d;
    });
    return { current, best };
  }

  // month grid for the study calendar (hours)
  function monthGrid(study, refDate) {
    const y = refDate.getFullYear(), m = refDate.getMonth();
    const first = new Date(y, m, 1);
    const dim = U.daysInMonth(y, m);
    const lead = (first.getDay()+6)%7;
    const map = new Map();
    study.forEach(s => { if (s.date.getFullYear()===y && s.date.getMonth()===m){ const k=s.date.getDate(); map.set(k,(map.get(k)||0)+s.hours);} });
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    let max = 0; map.forEach(v => max = Math.max(max, v));
    for (let d = 1; d <= dim; d++) cells.push({ day: d, hours: map.get(d)||0, max, date: new Date(y,m,d) });
    return { cells, monthLabel: `${U.MONTHS[m]} ${y}` };
  }

  // ============================================================
  //  MOCKS
  // ============================================================
  const maxTotal = () => U.sum((CFG.SUBJECTS||[]).map(s => s.max));

  function mockSeries(mocks) {
    return mocks.map(m => ({
      name: m.name, date: m.date, total: m.total, cutoff: m.cutoff,
      margin: m.total - m.cutoff, cleared: m.total >= m.cutoff,
    }));
  }

  // average score per subject (for radar / bar)
  function subjectAverages(mocks) {
    return (CFG.SUBJECTS||[]).map(s => {
      const vals = mocks.map(m => m.scores[s.key]).filter(v => v != null);
      return { key: s.key, label: s.label, color: s.color, max: s.max,
               avg: vals.length ? U.avg(vals) : 0,
               best: vals.length ? Math.max(...vals) : 0 };
    });
  }

  // subject-wise average as % of max — for "focus area" detection
  function subjectStrength(mocks) {
    return subjectAverages(mocks).map(s => ({ ...s, pct: s.max ? s.avg / s.max * 100 : 0 }))
      .sort((a, b) => a.pct - b.pct);
  }

  function clearanceRate(mocks) {
    if (!mocks.length) return 0;
    return Math.round(mocks.filter(m => m.total >= m.cutoff).length / mocks.length * 100);
  }

  // ============================================================
  //  INSIGHTS
  // ============================================================
  function insights(study, mocks, refDate, period, cd) {
    const out = [];
    const { start, end, label } = periodRange(refDate, period);
    const curStudy = filterRange(study, start, end);
    const curMocks = filterRange(mocks, start, end);

    // 1. Countdown
    if (cd.daysLeft != null) {
      out.push({ emoji: cd.daysLeft <= 14 ? '🚨' : '⏳',
        text: cd.daysLeft >= 0
          ? `${cd.daysLeft} days to ${cd.name} — ${cd.weeksLeft} full week${cd.weeksLeft===1?'':'s'} left.`
          : `${cd.name} was ${Math.abs(cd.daysLeft)} days ago.`,
        kind: cd.daysLeft <= 14 && cd.daysLeft >= 0 ? 'warn' : '' });
    }

    // 2. hours this period vs previous
    const span = U.daysBetween(start, end) + 1;
    const prevEnd = U.addDays(start, -1), prevStart = U.addDays(prevEnd, -(span-1));
    const prevHours = totalHours(filterRange(study, prevStart, prevEnd));
    const curHours = totalHours(curStudy);
    if (prevHours > 0) {
      const pct = Math.round((curHours - prevHours) / prevHours * 100);
      out.push({ emoji: pct >= 0 ? '📈' : '📉',
        text: `You studied ${U.fmtHours(curHours)} — ${Math.abs(pct)}% ${pct>=0?'more':'less'} than the previous ${period.replace('ly','')}.`,
        kind: pct < -15 ? 'warn' : pct > 0 ? 'good' : '' });
    } else if (curHours > 0) {
      out.push({ emoji:'📚', text:`Total study for ${label}: ${U.fmtHours(curHours)}.`, kind:'' });
    }

    // 3. avg hours/day vs goal
    const activeDays = new Set(curStudy.map(s => U.isoDate(s.date))).size;
    if (activeDays) {
      const perDay = curHours / (period === 'daily' ? 1 : span);
      const goal = CFG.DAILY_HOURS_GOAL;
      out.push({ emoji: perDay >= goal ? '🎯' : '🧭',
        text: `Averaging ${U.fmtHours(perDay)}/day (goal ${goal}h). ${activeDays} active day${activeDays===1?'':'s'}.`,
        kind: perDay >= goal ? 'good' : perDay < goal*0.6 ? 'warn' : '' });
    }

    // 4. streak
    const streak = studyStreak(study);
    if (streak.current >= 2)
      out.push({ emoji:'🔥', text:`${streak.current}-day study streak! (best: ${streak.best} days)`, kind: streak.current>=5?'good':'' });
    else if (streak.best >= 3)
      out.push({ emoji:'💤', text:`Streak broken — your best run was ${streak.best} days. Restart today!`, kind:'warn' });

    // 5. latest mock vs cutoff
    if (mocks.length) {
      const last = mocks[mocks.length - 1];
      const cleared = last.total >= last.cutoff;
      out.push({ emoji: cleared ? '✅' : '❌',
        text: `Latest mock (${last.name}): ${last.total}/${maxTotal()} vs cutoff ${last.cutoff} — ${cleared?`cleared by ${last.total-last.cutoff}`:`short by ${last.cutoff-last.total}`}.`,
        kind: cleared ? 'good' : 'warn' });
    }

    // 6. mock trend (last 3 vs previous 3)
    if (mocks.length >= 4) {
      const recent = mocks.slice(-3), older = mocks.slice(-6, -3);
      if (older.length) {
        const rAvg = U.avg(recent.map(m => m.total)), oAvg = U.avg(older.map(m => m.total));
        const diff = Math.round(rAvg - oAvg);
        out.push({ emoji: diff >= 0 ? '🚀' : '⚠️',
          text: `Recent mock average ${diff>=0?'up':'down'} ${Math.abs(diff)} marks vs earlier attempts (${Math.round(rAvg)} avg).`,
          kind: diff >= 0 ? 'good' : 'warn' });
      }
    }

    // 7. clearance rate
    if (mocks.length >= 3) {
      const rate = clearanceRate(mocks);
      out.push({ emoji: rate >= 60 ? '🏆' : '🎯',
        text: `You clear the cutoff in ${rate}% of mocks (${mocks.filter(m=>m.total>=m.cutoff).length}/${mocks.length}).`,
        kind: rate >= 60 ? 'good' : rate < 30 ? 'warn' : '' });
    }

    // 8. weakest subject -> focus
    if (mocks.length >= 2) {
      const weak = subjectStrength(mocks)[0];
      if (weak) out.push({ emoji:'🔎', text:`Focus area: ${weak.label} — averaging ${Math.round(weak.avg)}/${weak.max} (${Math.round(weak.pct)}%), your lowest section.`, kind:'warn' });
    }

    // 9. mocks attempted this period
    if (curMocks.length)
      out.push({ emoji:'📝', text:`${curMocks.length} mock${curMocks.length===1?'':'s'} attempted in ${label}.`, kind:'' });

    if (!out.length) out.push({ emoji:'🔍', text:`No study or mock data for ${label} yet.`, kind:'' });
    return out;
  }

  return {
    periodRange, filterRange, countdown,
    totalHours, bySubject, dailyHours, studyTrend, studyStreak, monthGrid,
    maxTotal, mockSeries, subjectAverages, subjectStrength, clearanceRate,
    insights,
  };
})();
