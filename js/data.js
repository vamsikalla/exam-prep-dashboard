/* ============================================================
   data.js — local persistence (primary) + optional network sources
   ------------------------------------------------------------
   Public API (window.DataStore):
     load()                    -> Promise (local read, or network fetch)
     refresh()                 -> Promise (re-read / re-fetch)
     onUpdate(cb)              -> subscribe to data changes
     startPolling()            -> interval refresh (network sources only)
     addStudy({date,subject,hours})
     addMock({date,name,scores,cutoff})
     deleteStudy(id) / deleteMock(id)
     loadSample() / clearAll()
     data -> { study:[{id,date,subject,hours}],
               mocks:[{id,date,name,scores,total,cutoff}] }
   ============================================================ */
window.DataStore = (function () {
  const CFG = window.CONFIG;
  const subs = [];
  let pollTimer = null;

  const store = {
    data: { study: [], mocks: [] },
    lastUpdated: null,
    onUpdate(cb){ subs.push(cb); },
    _emit(){ subs.forEach(cb => cb(store.data)); },
  };

  const isLocal = () => CFG.DATA_SOURCE === 'local';
  const num = (v) => parseFloat(String(v ?? '0').replace(/[^0-9.\-]/g, '')) || 0;
  const uid = () => 'e' + Date.now().toString(36) + Math.floor(Math.random()*1e6).toString(36);

  // ---------- localStorage read/write ----------
  function readLocal() {
    let study = [], mocks = [];
    try { study = JSON.parse(localStorage.getItem(CFG.STUDY_KEY)) || []; } catch (_) {}
    try { mocks = JSON.parse(localStorage.getItem(CFG.MOCK_KEY))  || []; } catch (_) {}
    return {
      study: study.map(s => ({ id: s.id || uid(), date: U.parseDate(s.date), subject: s.subject, hours: Number(s.hours)||0 }))
                  .filter(s => s.date && s.hours > 0),
      mocks: mocks.map(m => ({ id: m.id || uid(), date: U.parseDate(m.date), name: m.name,
                  scores: m.scores || {}, total: Number(m.total)||U.sum(Object.values(m.scores||{})), cutoff: Number(m.cutoff)||0 }))
                  .filter(m => m.date),
    };
  }
  function writeLocal() {
    try {
      localStorage.setItem(CFG.STUDY_KEY, JSON.stringify(store.data.study.map(s =>
        ({ id: s.id, date: U.isoDate(s.date), subject: s.subject, hours: s.hours }))));
      localStorage.setItem(CFG.MOCK_KEY, JSON.stringify(store.data.mocks.map(m =>
        ({ id: m.id, date: U.isoDate(m.date), name: m.name, scores: m.scores, total: m.total, cutoff: m.cutoff }))));
    } catch (_) {/* quota */}
  }

  // ---------- CSV / Apps Script parsing (optional sources) ----------
  function parseCSV(text) {
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"' && text[i+1] === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
      else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field=''; }
        else if (c === '\n') { row.push(field); rows.push(row); row=[]; field=''; }
        else if (c === '\r') {} else field += c; }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  }
  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(h => h.trim().toLowerCase());
    return rows.slice(1).map(r => { const o = {}; headers.forEach((h,i)=>o[h]=(r[i]||'').trim()); return o; });
  }
  const lowerKeys = (o) => { const out={}; Object.keys(o||{}).forEach(k=>out[String(k).trim().toLowerCase()]=o[k]); return out; };

  function normaliseStudy(objs) {
    return objs.map(lowerKeys).map(o => {
      const date = U.parseDate(o.date || o.day || o.timestamp || '');
      const subject = String(o.subject || o.topic || o.type || 'General').trim() || 'General';
      const hours = num(o.hours ?? o.hrs ?? o.time ?? o.duration);
      return date ? { id: uid(), date, subject, hours } : null;
    }).filter(Boolean).filter(s => s.hours > 0);
  }
  function normaliseMocks(objs) {
    const keys = (CFG.SUBJECTS || []).map(s => s.key);
    return objs.map(lowerKeys).map(o => {
      const date = U.parseDate(o.date || o.day || o.timestamp || '');
      if (!date) return null;
      const scores = {}; keys.forEach(k => scores[k] = num(o[k]));
      if (!scores.ga && o['general awareness'] != null) scores.ga = num(o['general awareness']);
      const total = o.total != null && String(o.total).trim() !== '' ? num(o.total) : U.sum(keys.map(k => scores[k]));
      const cutoff = num(o.cutoff ?? o['cut off'] ?? o['cutoff marks']);
      const name = String(o.name || o.mock || o.title || `Mock ${U.isoDate(date)}`).trim();
      return { id: uid(), date, name, scores, total, cutoff };
    }).filter(Boolean);
  }
  async function fetchAppsScript() {
    const res = await fetch(CFG.APPS_SCRIPT_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error('Apps Script HTTP ' + res.status);
    const json = await res.json();
    return { study: normaliseStudy(json.study || json.Study || json.StudyLog || []),
             mocks: normaliseMocks(json.mocks || json.Mocks || []) };
  }
  async function fetchCSV() {
    const [sTxt, mTxt] = await Promise.all([
      CFG.STUDY_CSV_URL ? fetch(CFG.STUDY_CSV_URL).then(r=>r.text()) : Promise.resolve(''),
      CFG.MOCK_CSV_URL  ? fetch(CFG.MOCK_CSV_URL).then(r=>r.text())  : Promise.resolve(''),
    ]);
    return { study: sTxt ? normaliseStudy(rowsToObjects(parseCSV(sTxt))) : [],
             mocks: mTxt ? normaliseMocks(rowsToObjects(parseCSV(mTxt))) : [] };
  }

  // ---------- Sample data generator (for the "Load sample" button) ----------
  function makeSample() {
    const rand = (a,b) => a + Math.random()*(b-a);
    const subs = (CFG.SUBJECTS || []).map(s => s.key);
    const today = U.startOfDay(new Date());
    const start = U.addDays(today, -75);

    const study = [];
    const buckets = [ {name:'Quant',w:26},{name:'Reasoning',w:22},{name:'English',w:16},
                      {name:'GA',w:14},{name:'Current Affairs',w:12},{name:'Revision',w:10} ];
    const totalDays = Math.max(1, U.daysBetween(start, today));
    for (let d = new Date(start); d <= today; d = U.addDays(d, 1)) {
      const progress = U.daysBetween(start, d) / totalDays;
      if (Math.random() < 0.14 * (1 - progress*0.6)) continue;
      let dayHours = rand(3 + progress*3, 6 + progress*4);
      if (d.getDay() === 0) dayHours *= 0.7;
      dayHours = Math.round(dayHours*2)/2;
      const picks = buckets.slice().sort(()=>Math.random()-0.5).slice(0, 2 + Math.floor(Math.random()*3));
      const wsum = U.sum(picks.map(p=>p.w));
      picks.forEach(p => { const h = Math.round((dayHours*p.w/wsum)*2)/2; if (h>=0.5) study.push({ id: uid(), date:new Date(d), subject:p.name, hours:h }); });
    }

    const mocks = []; let n = 1;
    const maxTotal = U.sum((CFG.SUBJECTS||[]).map(s=>s.max));
    for (let d = new Date(start); d <= today; d = U.addDays(d, 1)) {
      if (!(d.getDay()===3 || d.getDay()===0)) continue;
      if (Math.random() < 0.25) continue;
      const progress = U.daysBetween(start, d) / totalDays;
      const scores = {};
      subs.forEach((k,i) => { const meta = CFG.SUBJECTS[i];
        const base = 0.35 + progress*0.45, noise = (Math.random()-0.5)*0.22, skill = [0.05,0.02,-0.04,-0.06][i]||0;
        scores[k] = Math.round(U.clamp(base+noise+skill, 0.15, 0.98) * meta.max); });
      const total = U.sum(subs.map(k=>scores[k]));
      const cutoff = Math.round(maxTotal * (0.45 + progress*0.06));
      mocks.push({ id: uid(), date:new Date(d), name:`Mock #${n++}`, scores, total, cutoff });
    }
    return { study, mocks };
  }

  // ---------- Network cache (network sources only) ----------
  function saveCache(data) {
    try { localStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ t: Date.now(),
      study: data.study.map(s=>({d:U.isoDate(s.date),s:s.subject,h:s.hours})),
      mocks: data.mocks.map(m=>({d:U.isoDate(m.date),n:m.name,sc:m.scores,t:m.total,c:m.cutoff})) })); } catch(_){}
  }
  function loadCache() {
    try { const p = JSON.parse(localStorage.getItem(CFG.CACHE_KEY)); if (!p || Date.now()-p.t > CFG.CACHE_TTL) return null;
      return { study:(p.study||[]).map(s=>({id:uid(),date:U.parseDate(s.d),subject:s.s,hours:s.h})),
               mocks:(p.mocks||[]).map(m=>({id:uid(),date:U.parseDate(m.d),name:m.n,scores:m.sc,total:m.t,cutoff:m.c})) }; }
    catch(_){ return null; }
  }

  // ---------- Orchestration ----------
  function sortData(data) {
    data.study.sort((a,b)=>a.date-b.date);
    data.mocks.sort((a,b)=>a.date-b.date);
    return data;
  }
  function commit(data, { persist = false } = {}) {
    store.data = sortData(data);
    store.lastUpdated = new Date();
    if (persist && isLocal()) writeLocal();
    store._emit();
  }

  store.load = async function () {
    if (isLocal()) {
      commit(readLocal());
      return { ok: true, source: 'local' };
    }
    const cached = loadCache();
    if (cached && (cached.study.length || cached.mocks.length)) commit(cached);
    try {
      const fresh = CFG.DATA_SOURCE === 'appsscript' ? await fetchAppsScript() : await fetchCSV();
      commit(fresh); saveCache(fresh);
      return { ok: true, source: CFG.DATA_SOURCE };
    } catch (err) {
      console.warn('[DataStore] fetch failed:', err);
      if (!cached) { commit({ study: [], mocks: [] }); return { ok:false, source:'empty', error:err }; }
      return { ok:false, source:'cache', error:err };
    }
  };

  store.refresh = async function () {
    if (isLocal()) { commit(readLocal()); return store.data; }
    const fresh = CFG.DATA_SOURCE === 'appsscript' ? await fetchAppsScript() : await fetchCSV();
    commit(fresh); saveCache(fresh); return fresh;
  };

  // ---------- CRUD (local) ----------
  store.addStudy = function ({ date, subject, hours }) {
    const d = U.parseDate(date); if (!d) return null;
    const entry = { id: uid(), date: d, subject: String(subject||'General').trim()||'General', hours: Number(hours)||0 };
    if (entry.hours <= 0) return null;
    store.data.study.push(entry); commit(store.data, { persist:true }); return entry;
  };
  store.addMock = function ({ date, name, scores, cutoff }) {
    const d = U.parseDate(date); if (!d) return null;
    const keys = (CFG.SUBJECTS||[]).map(s=>s.key);
    const sc = {}; keys.forEach(k => sc[k] = Number(scores?.[k]) || 0);
    const total = U.sum(keys.map(k=>sc[k]));
    const entry = { id: uid(), date: d, name: String(name||`Mock ${U.isoDate(d)}`).trim(), scores: sc, total, cutoff: Number(cutoff)||0 };
    store.data.mocks.push(entry); commit(store.data, { persist:true }); return entry;
  };
  store.deleteStudy = function (id) {
    store.data.study = store.data.study.filter(s => s.id !== id); commit(store.data, { persist:true });
  };
  store.deleteMock = function (id) {
    store.data.mocks = store.data.mocks.filter(m => m.id !== id); commit(store.data, { persist:true });
  };
  store.loadSample = function () { commit(makeSample(), { persist:true }); };
  store.clearAll = function () { commit({ study: [], mocks: [] }, { persist:true }); };

  store.nextMockName = function () {
    const nums = store.data.mocks.map(m => { const mt = String(m.name).match(/#\s*(\d+)/); return mt ? +mt[1] : 0; });
    return `Mock #${(nums.length ? Math.max(...nums) : 0) + 1}`;
  };

  store.startPolling = function () {
    if (isLocal() || !CFG.REFRESH_INTERVAL) return;
    clearInterval(pollTimer);
    pollTimer = setInterval(() => store.refresh().catch(e => console.warn('[poll] failed', e)), CFG.REFRESH_INTERVAL);
  };

  return store;
})();
