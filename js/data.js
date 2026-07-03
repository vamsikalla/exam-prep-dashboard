/* ============================================================
   data.js — storage layer (local browser OR Google Sheet)
   ------------------------------------------------------------
   Public API (window.DataStore):
     load()  refresh()                 -> Promise
     onUpdate(cb)                       -> subscribe
     startPolling()                     -> interval refresh (sheet mode)
     addStudy(x) addMock(x)             -> Promise<entry>   (async in both modes)
     deleteStudy(id) deleteMock(id)     -> Promise
     loadSample() clearAll()            -> Promise
     saveSettings(obj)                  -> Promise   (sheet mode only)
     testSheet(url) importLocalToSheet()-> Promise
     localCounts()  nextMockName()
     data -> { study:[{id,date,subject,hours}],
               mocks:[{id,date,name,scores,total,cutoff}],
               settings? }
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
  const subjectKeys = () => (CFG.SUBJECTS || []).map(s => s.key);

  function sortData(d) { d.study.sort((a,b)=>a.date-b.date); d.mocks.sort((a,b)=>a.date-b.date); return d; }
  function setData(study, mocks, settings) {
    store.data = { study, mocks };
    if (settings) store.data.settings = settings;
    sortData(store.data);
    store.lastUpdated = new Date();
    store._emit();
  }
  function emitLocal() { writeLocal(); sortData(store.data); store.lastUpdated = new Date(); store._emit(); }

  // ---------- serialisation helpers ----------
  const studyRow = (s) => ({ id: s.id, date: U.isoDate(s.date), subject: s.subject, hours: s.hours });
  const mockRow  = (m) => { const r = { id: m.id, date: U.isoDate(m.date), name: m.name };
    subjectKeys().forEach(k => r[k] = m.scores[k] || 0); r.total = m.total; r.cutoff = m.cutoff; return r; };

  // ---------- localStorage ----------
  function readLocal() {
    let study = [], mocks = [];
    try { study = JSON.parse(localStorage.getItem(CFG.STUDY_KEY)) || []; } catch (_) {}
    try { mocks = JSON.parse(localStorage.getItem(CFG.MOCK_KEY))  || []; } catch (_) {}
    return {
      study: study.map(s => ({ id: s.id||uid(), date: U.parseDate(s.date), subject: s.subject, hours: Number(s.hours)||0 }))
                  .filter(s => s.date && s.hours > 0),
      mocks: mocks.map(m => ({ id: m.id||uid(), date: U.parseDate(m.date), name: m.name,
                  scores: m.scores||{}, total: Number(m.total)||U.sum(Object.values(m.scores||{})), cutoff: Number(m.cutoff)||0 }))
                  .filter(m => m.date),
    };
  }
  function writeLocal() {
    try {
      localStorage.setItem(CFG.STUDY_KEY, JSON.stringify(store.data.study.map(studyRow)));
      localStorage.setItem(CFG.MOCK_KEY,  JSON.stringify(store.data.mocks.map(mockRow)));
    } catch (_) {}
  }
  store.localCounts = function () { const d = readLocal(); return { study: d.study.length, mocks: d.mocks.length, total: d.study.length + d.mocks.length }; };

  // ---------- normalisation (from sheet / csv objects) ----------
  const lowerKeys = (o) => { const out={}; Object.keys(o||{}).forEach(k=>out[String(k).trim().toLowerCase()]=o[k]); return out; };
  function normaliseStudy(objs) {
    return (objs||[]).map(lowerKeys).map(o => {
      const date = U.parseDate(o.date || o.day || o.timestamp || '');
      const subject = String(o.subject || o.topic || o.type || 'General').trim() || 'General';
      const hours = num(o.hours ?? o.hrs ?? o.time ?? o.duration);
      return date ? { id: String(o.id||'').trim() || uid(), date, subject, hours } : null;
    }).filter(Boolean).filter(s => s.hours > 0);
  }
  function normaliseMocks(objs) {
    const keys = subjectKeys();
    return (objs||[]).map(lowerKeys).map(o => {
      const date = U.parseDate(o.date || o.day || o.timestamp || '');
      if (!date) return null;
      const scores = {}; keys.forEach(k => scores[k] = num(o[k]));
      if (!scores.ga && o['general awareness'] != null) scores.ga = num(o['general awareness']);
      const total = o.total != null && String(o.total).trim() !== '' ? num(o.total) : U.sum(keys.map(k=>scores[k]));
      const cutoff = num(o.cutoff ?? o['cut off'] ?? o['cutoff marks']);
      const name = String(o.name || o.mock || o.title || `Mock ${U.isoDate(date)}`).trim();
      return { id: String(o.id||'').trim() || uid(), date, name, scores, total, cutoff };
    }).filter(Boolean);
  }
  function normaliseSettings(s) {
    if (!s || typeof s !== 'object') return null;
    const out = {};
    if (s.examName  != null) out.examName  = String(s.examName);
    if (s.examDate  != null) out.examDate  = String(s.examDate);
    if (s.prepStart != null) out.prepStart = String(s.prepStart);
    if (s.dailyGoal != null) out.dailyGoal = Number(s.dailyGoal);
    if (s.subjectMax && typeof s.subjectMax === 'object') out.subjectMax = s.subjectMax;
    return Object.keys(out).length ? out : null;
  }

  // ---------- Google Sheet (Apps Script Web App) ----------
  function bust(url) { return url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(); }
  async function getFromSheet(url) {
    const res = await fetch(bust(url || CFG.APPS_SCRIPT_URL), { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return { study: normaliseStudy(j.study || j.Study || j.StudyLog || []),
             mocks: normaliseMocks(j.mocks || j.Mocks || []),
             settings: normaliseSettings(j.settings || j.Settings) };
  }
  async function postToSheet(payload) {
    // text/plain keeps it a "simple" CORS request (no preflight, which Apps Script can't answer)
    const res = await fetch(CFG.APPS_SCRIPT_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let j = null; try { j = await res.json(); } catch (_) {}
    if (j && j.ok === false) throw new Error(j.error || 'Sheet write failed');
    return j || { ok: true };
  }
  store.testSheet = getFromSheet;   // GET only — used by the "Test connection" button

  // ---------- optional CSV source ----------
  function parseCSV(text) {
    const rows = []; let row=[], field='', inQ=false;
    for (let i=0;i<text.length;i++){ const c=text[i];
      if (inQ){ if(c==='"'&&text[i+1]==='"'){field+='"';i++;} else if(c==='"')inQ=false; else field+=c; }
      else { if(c==='"')inQ=true; else if(c===','){row.push(field);field='';} else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';} else if(c==='\r'){} else field+=c; } }
    if (field.length||row.length){ row.push(field); rows.push(row); }
    return rows.filter(r=>r.some(c=>c.trim()!==''));
  }
  const rowsToObjects = (rows) => !rows.length ? [] : rows.slice(1).map(r => { const o={}; rows[0].map(h=>h.trim().toLowerCase()).forEach((h,i)=>o[h]=(r[i]||'').trim()); return o; });
  async function fetchCSV() {
    const [s,m] = await Promise.all([
      CFG.STUDY_CSV_URL ? fetch(CFG.STUDY_CSV_URL).then(r=>r.text()) : Promise.resolve(''),
      CFG.MOCK_CSV_URL  ? fetch(CFG.MOCK_CSV_URL).then(r=>r.text())  : Promise.resolve(''),
    ]);
    return { study: s?normaliseStudy(rowsToObjects(parseCSV(s))):[], mocks: m?normaliseMocks(rowsToObjects(parseCSV(m))):[], settings:null };
  }

  // ---------- sample data ----------
  function makeSample() {
    const rand=(a,b)=>a+Math.random()*(b-a); const subs=subjectKeys();
    const today=U.startOfDay(new Date()); const start=U.addDays(today,-75);
    const study=[]; const buckets=[{name:'Quant',w:26},{name:'Reasoning',w:22},{name:'English',w:16},{name:'GA',w:14},{name:'Current Affairs',w:12},{name:'Revision',w:10}];
    const totalDays=Math.max(1,U.daysBetween(start,today));
    for (let d=new Date(start); d<=today; d=U.addDays(d,1)){
      const p=U.daysBetween(start,d)/totalDays; if (Math.random()<0.14*(1-p*0.6)) continue;
      let dh=rand(3+p*3,6+p*4); if (d.getDay()===0) dh*=0.7; dh=Math.round(dh*2)/2;
      const picks=buckets.slice().sort(()=>Math.random()-0.5).slice(0,2+Math.floor(Math.random()*3)); const ws=U.sum(picks.map(x=>x.w));
      picks.forEach(x=>{ const h=Math.round((dh*x.w/ws)*2)/2; if(h>=0.5) study.push({id:uid(),date:new Date(d),subject:x.name,hours:h}); });
    }
    const mocks=[]; let n=1; const maxT=U.sum((CFG.SUBJECTS||[]).map(s=>s.max));
    for (let d=new Date(start); d<=today; d=U.addDays(d,1)){
      if (!(d.getDay()===3||d.getDay()===0)) continue; if (Math.random()<0.25) continue;
      const p=U.daysBetween(start,d)/totalDays; const scores={};
      subs.forEach((k,i)=>{ const meta=CFG.SUBJECTS[i]; const base=0.35+p*0.45, noise=(Math.random()-0.5)*0.22, skill=[0.05,0.02,-0.04,-0.06][i]||0; scores[k]=Math.round(U.clamp(base+noise+skill,0.15,0.98)*meta.max); });
      mocks.push({id:uid(),date:new Date(d),name:`Mock #${n++}`,scores,total:U.sum(subs.map(k=>scores[k])),cutoff:Math.round(maxT*(0.45+p*0.06))});
    }
    return { study, mocks };
  }

  // ---------- load / refresh ----------
  async function fetchSource() {
    if (CFG.DATA_SOURCE === 'appsscript') return getFromSheet();
    if (CFG.DATA_SOURCE === 'csv') return fetchCSV();
    return null;
  }
  store.load = async function () {
    if (isLocal()) { const d = readLocal(); setData(d.study, d.mocks); return { ok:true, source:'local' }; }
    try { const d = await fetchSource(); setData(d.study, d.mocks, d.settings); return { ok:true, source:CFG.DATA_SOURCE }; }
    catch (err) { console.warn('[DataStore] load failed:', err); setData([], []); return { ok:false, source:'error', error:err }; }
  };
  store.refresh = store.load;

  // ---------- mutations ----------
  store.addStudy = async function (input) {
    const d = U.parseDate(input.date); if (!d) throw new Error('Enter a valid date');
    const entry = { id: uid(), date: d, subject: String(input.subject||'General').trim()||'General', hours: Number(input.hours)||0 };
    if (entry.hours <= 0) throw new Error('Enter valid hours');
    if (isLocal()) { store.data.study.push(entry); emitLocal(); return entry; }
    await postToSheet({ action:'addStudy', entry: studyRow(entry) });
    await store.load(); return entry;
  };
  store.addMock = async function (input) {
    const d = U.parseDate(input.date); if (!d) throw new Error('Enter a valid date');
    const keys = subjectKeys(); const scores = {}; keys.forEach(k => scores[k] = Number(input.scores?.[k])||0);
    const entry = { id: uid(), date: d, name: String(input.name||`Mock ${U.isoDate(d)}`).trim(), scores, total: U.sum(keys.map(k=>scores[k])), cutoff: Number(input.cutoff)||0 };
    if (isLocal()) { store.data.mocks.push(entry); emitLocal(); return entry; }
    await postToSheet({ action:'addMock', entry: mockRow(entry) });
    await store.load(); return entry;
  };
  store.deleteStudy = async function (id) {
    if (isLocal()) { store.data.study = store.data.study.filter(s=>s.id!==id); emitLocal(); return; }
    await postToSheet({ action:'deleteStudy', id }); await store.load();
  };
  store.deleteMock = async function (id) {
    if (isLocal()) { store.data.mocks = store.data.mocks.filter(m=>m.id!==id); emitLocal(); return; }
    await postToSheet({ action:'deleteMock', id }); await store.load();
  };
  store.saveSettings = async function (obj) {
    if (isLocal()) return;   // local settings handled by Settings.saveExamLocal
    await postToSheet({ action:'saveSettings', settings: obj }); await store.load();
  };
  store.loadSample = async function () {
    const s = makeSample();
    if (isLocal()) { setData(s.study, s.mocks); writeLocal(); return; }
    await postToSheet({ action:'clearAll' });
    await postToSheet({ action:'import', study: s.study.map(studyRow), mocks: s.mocks.map(mockRow) });
    await store.load();
  };
  store.clearAll = async function () {
    if (isLocal()) { store.data.study = []; store.data.mocks = []; emitLocal(); return; }
    await postToSheet({ action:'clearAll' }); await store.load();
  };
  store.importLocalToSheet = async function () {
    const local = readLocal();
    await postToSheet({ action:'import', study: local.study.map(studyRow), mocks: local.mocks.map(mockRow) });
  };

  store.nextMockName = function () {
    const nums = store.data.mocks.map(m => { const t = String(m.name).match(/#\s*(\d+)/); return t ? +t[1] : 0; });
    return `Mock #${(nums.length ? Math.max(...nums) : 0) + 1}`;
  };

  store.startPolling = function () {
    clearInterval(pollTimer);
    if (isLocal() || !CFG.REFRESH_INTERVAL) return;
    pollTimer = setInterval(() => store.load().catch(e => console.warn('[poll]', e)), CFG.REFRESH_INTERVAL);
  };

  return store;
})();
