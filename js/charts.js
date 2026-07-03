/* ============================================================
   charts.js — all ECharts visualisations
   ------------------------------------------------------------
   Charts.init()            create instances
   Charts.render(ctx)       (re)draw everything for current view
   Charts.resize()          on window resize
   ctx = { allStudy, periodStudy, allMocks, periodMocks, refDate, period, range }
   ============================================================ */
window.Charts = (function () {
  const CFG = window.CONFIG;
  const ids = {
    trend:'chartTrend', pie:'chartPie', daily:'chartDaily',
    subjhours:'chartSubjectHours',
    mocktrend:'chartMockTrend', radar:'chartRadar',
    subjavg:'chartSubjectAvg', margin:'chartMargin',
  };
  const inst = {};

  function init() {
    Object.entries(ids).forEach(([k, id]) => {
      const dom = document.getElementById(id);
      if (dom) inst[k] = echarts.init(dom, null, { renderer: 'canvas' });
    });
  }

  // ---- theme-aware base tokens ----
  function T() {
    return {
      text: U.cssVar('--text'),
      dim:  U.cssVar('--text-dim'),
      faint:U.cssVar('--text-faint'),
      grid: U.cssVar('--grid-line'),
      palette: U.PALETTE,
      surface: U.cssVar('--surface-strong'),
      border: U.cssVar('--border-strong'),
    };
  }
  const hrs = (v) => U.fmtHours(v);
  function tipStyle(t) {
    return {
      backgroundColor: t.surface, borderColor: t.border, borderWidth: 1,
      textStyle: { color: t.text, fontSize: 12 },
      extraCssText: 'backdrop-filter:blur(8px);border-radius:12px;box-shadow:0 12px 30px -12px rgba(0,0,0,.5);',
    };
  }
  const grid = (t, over = {}) => Object.assign({ left: 46, right: 18, top: 24, bottom: 32, containLabel: true }, over);
  const catAxis = (t, data, over = {}) => Object.assign({
    type: 'category', data,
    axisLine: { lineStyle: { color: t.grid } },
    axisTick: { show: false },
    axisLabel: { color: t.dim, fontSize: 11 },
  }, over);
  const valAxis = (t, over = {}) => Object.assign({
    type: 'value',
    splitLine: { lineStyle: { color: t.grid } },
    axisLabel: { color: t.dim, fontSize: 11 },
  }, over);

  const subjColors = () => (CFG.SUBJECTS||[]).map(s => s.color);

  // ============================================================
  function render(ctx) {
    const t = T();
    renderTrend(t, ctx);
    renderPie(t, ctx.periodStudy);
    renderDaily(t, ctx);
    renderSubjectHours(t, ctx.periodStudy);
    renderMockTrend(t, ctx.allMocks);
    renderRadar(t, ctx.allMocks);
    renderSubjectAvg(t, ctx.allMocks);
    renderMargin(t, ctx.allMocks);
  }

  // 1. Study hours trend --------------------------------------
  function renderTrend(t, ctx) {
    const s = Agg.studyTrend(ctx.allStudy, ctx.refDate, ctx.period);
    inst.trend.setOption({
      tooltip: { trigger: 'axis', ...tipStyle(t), valueFormatter: hrs },
      grid: grid(t),
      xAxis: catAxis(t, s.labels, { boundaryGap: false }),
      yAxis: valAxis(t, { axisLabel: { color: t.dim, fontSize: 11, formatter: (v)=>v+'h' } }),
      series: [{
        type: 'line', smooth: true, data: s.values, showSymbol: false,
        lineStyle: { width: 3, color: t.palette[0] },
        areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[
          { offset:0, color:'rgba(91,147,255,.35)' }, { offset:1, color:'rgba(91,147,255,0)' }]) },
        emphasis: { focus: 'series' },
        markLine: CFG.DAILY_HOURS_GOAL && s.unit === 'day' ? {
          silent: true, symbol: 'none',
          lineStyle: { color: t.palette[2], type: 'dashed', width: 1.5 },
          data: [{ yAxis: CFG.DAILY_HOURS_GOAL, label: { formatter: `goal ${CFG.DAILY_HOURS_GOAL}h`, color: t.dim, fontSize: 10 } }],
        } : undefined,
        animationDuration: 900,
      }],
    }, true);
    const hint = document.getElementById('trendHint');
    if (hint) hint.textContent = s.unit === 'month' ? 'hours by month' : 'hours by day (this month)';
  }

  // 2. Subject distribution (donut) ---------------------------
  function renderPie(t, study) {
    const data = Agg.bySubject(study);
    const totalV = U.sum(data.map(d => d.value)) || 1;
    inst.pie.setOption({
      tooltip: { trigger: 'item', ...tipStyle(t),
        formatter: (p) => `${p.marker} <b>${p.name}</b><br/>${hrs(p.value)} · ${p.percent}%` },
      legend: { type:'scroll', bottom: 0, textStyle:{ color:t.dim, fontSize:11 }, icon:'circle' },
      color: t.palette,
      series: [{
        type: 'pie', radius: ['48%','72%'], center:['50%','44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: 'transparent', borderWidth: 2, borderRadius: 6,
          color: (p) => U.subjectColor(p.name) },
        label: { show:false },
        emphasis: { scale:true, scaleSize:8, label:{ show:true, formatter:'{b}\n{d}%', color:t.text, fontSize:12, fontWeight:600 } },
        data: data.map(d => ({ name:d.name, value:Math.round(d.value*10)/10 })),
        animationType:'scale', animationEasing:'elasticOut',
      }],
      graphic: [{ type:'text', left:'center', top:'39%', style:{ text:U.fmtShort(totalV)+'h', fill:t.text, fontSize:20, fontWeight:800, fontFamily:'JetBrains Mono' } },
                { type:'text', left:'center', top:'51%', style:{ text:'total', fill:t.faint, fontSize:11 } }],
    }, true);
  }

  // 3. Daily study hours (bar) --------------------------------
  function renderDaily(t, ctx) {
    const s = Agg.dailyHours(ctx.periodStudy, ctx.range.start, ctx.range.end);
    const labels = s.map(x => ctx.period === 'yearly' ? U.fmtDayLabel(x.date) : x.date.getDate());
    inst.daily.setOption({
      tooltip: { trigger:'axis', ...tipStyle(t),
        formatter: (ps) => { const p = ps[0]; const d = s[p.dataIndex].date; return `${U.fmtDayLabel(d)}<br/>${hrs(p.value)}`; } },
      grid: grid(t),
      xAxis: catAxis(t, labels),
      yAxis: valAxis(t, { axisLabel: { color: t.dim, fontSize: 11, formatter: (v)=>v+'h' } }),
      series: [{
        type:'bar', data: s.map(x => Math.round(x.value*10)/10),
        itemStyle:{ borderRadius:[6,6,0,0], color:new echarts.graphic.LinearGradient(0,0,0,1,[
          { offset:0, color:t.palette[0] }, { offset:1, color:t.palette[1] }]) },
        barMaxWidth: 26, animationDelay:(i)=>i*12,
        markLine: CFG.DAILY_HOURS_GOAL ? {
          silent: true, symbol: 'none',
          lineStyle: { color: t.palette[2], type: 'dashed', width: 1.5 },
          data: [{ yAxis: CFG.DAILY_HOURS_GOAL }],
        } : undefined,
      }],
    }, true);
  }

  // 4. Hours by subject (horizontal bar) ----------------------
  function renderSubjectHours(t, study) {
    const data = Agg.bySubject(study).slice(0, 10).reverse();
    inst.subjhours.setOption({
      tooltip: { trigger:'axis', axisPointer:{type:'shadow'}, ...tipStyle(t), valueFormatter: hrs },
      grid: grid(t, { left: 8, right: 44 }),
      xAxis: valAxis(t, { axisLabel: { color: t.dim, fontSize: 11, formatter: (v)=>v+'h' } }),
      yAxis: catAxis(t, data.map(d=>d.name)),
      series: [{
        type:'bar', data: data.map(d=>({ value:Math.round(d.value*10)/10,
          itemStyle:{ borderRadius:[0,6,6,0], color:U.subjectColor(d.name) } })),
        label:{ show:true, position:'right', color:t.dim, fontSize:10, formatter:(p)=>U.fmtShort(p.value)+'h' },
        barMaxWidth: 20, animationDelay:(i)=>i*40,
      }],
    }, true);
  }

  // 5. Mock score vs cutoff over time -------------------------
  function renderMockTrend(t, mocks) {
    const s = Agg.mockSeries(mocks);
    const labels = s.map(m => m.name.replace(/^Mock\s*/i,'#').trim() || U.fmtDayLabel(m.date));
    inst.mocktrend.setOption({
      tooltip: { trigger:'axis', ...tipStyle(t),
        formatter: (ps) => {
          const i = ps[0].dataIndex, m = s[i];
          return `<b>${m.name}</b> · ${U.fmtDayLabel(m.date)}<br/>Score: <b>${m.total}</b> / ${Agg.maxTotal()}<br/>Cutoff: ${m.cutoff}<br/>${m.cleared?`✅ +${m.margin}`:`❌ ${m.margin}`}` } },
      legend: { bottom: 0, textStyle:{ color:t.dim, fontSize:11 }, icon:'roundRect' },
      grid: grid(t, { bottom: 40 }),
      xAxis: catAxis(t, labels, { axisLabel:{ color:t.dim, fontSize:10, rotate: labels.length > 10 ? 40 : 0 } }),
      yAxis: valAxis(t, { max: Agg.maxTotal() }),
      series: [
        { name:'Score', type:'line', smooth:true, data:s.map(m=>m.total), symbolSize:7,
          lineStyle:{ width:3, color:t.palette[0] }, itemStyle:{ color:t.palette[0] },
          areaStyle:{ color:new echarts.graphic.LinearGradient(0,0,0,1,[
            { offset:0, color:'rgba(91,147,255,.28)' }, { offset:1, color:'rgba(91,147,255,0)' }]) },
        },
        { name:'Cutoff', type:'line', data:s.map(m=>m.cutoff), symbol:'none', smooth:false,
          lineStyle:{ width:2, type:'dashed', color:t.palette[4] }, z: 1 },
      ],
    }, true);
  }

  // 6. Subject strengths radar --------------------------------
  function renderRadar(t, mocks) {
    const avgs = Agg.subjectAverages(mocks);
    inst.radar.setOption({
      tooltip: { ...tipStyle(t) },
      radar: {
        indicator: avgs.map(a => ({ name: a.label, max: a.max })),
        radius: '66%', center: ['50%','52%'],
        axisName: { color: t.dim, fontSize: 11 },
        splitLine: { lineStyle: { color: t.grid } },
        splitArea: { areaStyle: { color: ['transparent'] } },
        axisLine: { lineStyle: { color: t.grid } },
      },
      series: [{
        type: 'radar',
        data: [
          { value: avgs.map(a => Math.round(a.best)), name: 'Best',
            lineStyle:{ color:t.palette[2], type:'dashed' }, itemStyle:{ color:t.palette[2] },
            areaStyle:{ opacity:0.04 } },
          { value: avgs.map(a => Math.round(a.avg)), name: 'Average',
            lineStyle:{ width:2, color:t.palette[0] }, itemStyle:{ color:t.palette[0] },
            areaStyle:{ color:'rgba(91,147,255,.22)' } },
        ],
      }],
      legend: { bottom: 0, textStyle:{ color:t.dim, fontSize:11 }, icon:'roundRect', data:['Average','Best'] },
    }, true);
  }

  // 7. Average score by subject (bar, coloured, w/ max ghost) --
  function renderSubjectAvg(t, mocks) {
    const avgs = Agg.subjectAverages(mocks);
    inst.subjavg.setOption({
      tooltip: { trigger:'axis', axisPointer:{type:'shadow'}, ...tipStyle(t),
        formatter: (ps) => {
          const i = ps[0].dataIndex, a = avgs[i];
          return `<b>${a.label}</b><br/>Avg: ${Math.round(a.avg)} / ${a.max}<br/>Best: ${Math.round(a.best)}` } },
      grid: grid(t, { bottom: 24 }),
      xAxis: catAxis(t, avgs.map(a=>a.label)),
      yAxis: valAxis(t, { max: Math.max(...avgs.map(a=>a.max), 10) }),
      series: [
        { name:'Max', type:'bar', barGap:'-100%', data: avgs.map(a=>a.max),
          itemStyle:{ color:t.grid, borderRadius:[6,6,0,0] }, barMaxWidth:38, silent:true, z:1 },
        { name:'Average', type:'bar', data: avgs.map(a=>({ value:Math.round(a.avg),
          itemStyle:{ color:a.color, borderRadius:[6,6,0,0] } })),
          barMaxWidth:38, z:2, animationDelay:(i)=>i*60,
          label:{ show:true, position:'top', color:t.dim, fontSize:11, formatter:(p)=>p.value } },
      ],
    }, true);
  }

  // 8. Cutoff margin per mock (diverging) ---------------------
  function renderMargin(t, mocks) {
    const s = Agg.mockSeries(mocks);
    const labels = s.map(m => m.name.replace(/^Mock\s*/i,'#').trim() || U.fmtDayLabel(m.date));
    inst.margin.setOption({
      tooltip: { trigger:'axis', axisPointer:{type:'shadow'}, ...tipStyle(t),
        formatter: (ps) => { const i=ps[0].dataIndex, m=s[i];
          return `<b>${m.name}</b><br/>${m.cleared?'Cleared by':'Short by'} <b>${Math.abs(m.margin)}</b> marks` } },
      grid: grid(t, { bottom: 40 }),
      xAxis: catAxis(t, labels, { axisLabel:{ color:t.dim, fontSize:10, rotate: labels.length > 10 ? 40 : 0 } }),
      yAxis: valAxis(t),
      series: [{
        type:'bar', data: s.map(m => ({ value: m.margin,
          itemStyle:{ borderRadius: m.margin>=0?[6,6,0,0]:[0,0,6,6],
            color: m.margin>=0 ? t.palette[2] : t.palette[4] } })),
        barMaxWidth: 22, animationDelay:(i)=>i*20,
        markLine:{ silent:true, symbol:'none', lineStyle:{ color:t.border, width:1 }, data:[{ yAxis:0 }] },
      }],
    }, true);
  }

  // ---- utilities ----
  function resize() { Object.values(inst).forEach(c => c && c.resize()); }
  function pngOf(key) { return inst[key] ? inst[key].getDataURL({ pixelRatio:2, backgroundColor: U.cssVar('--bg-1') }) : null; }
  function all() { return inst; }

  return { init, render, resize, pngOf, all };
})();
