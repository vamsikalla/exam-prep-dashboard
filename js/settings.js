/* ============================================================
   settings.js — storage bootstrap + exam settings
   ------------------------------------------------------------
   Two kinds of settings:
     • bootstrap  {storageMode:'local'|'sheet', appsScriptUrl} — ALWAYS local
       (it tells us where everything else lives). Key: BOOTSTRAP_KEY.
     • exam       {examName, examDate, prepStart, dailyGoal, subjectMax}
       — stored in localStorage (local mode) or in the sheet (sheet mode);
       either way we mirror the values onto window.CONFIG so the rest of
       the app keeps reading CONFIG unchanged.
   ============================================================ */
window.Settings = (function () {
  const CFG = window.CONFIG;

  // ---------- bootstrap (storage location) ----------
  function getBootstrap() {
    try { return JSON.parse(localStorage.getItem(CFG.BOOTSTRAP_KEY)) || {}; }
    catch (_) { return {}; }
  }
  function saveBootstrap(partial) {
    const merged = Object.assign(getBootstrap(), partial);
    try { localStorage.setItem(CFG.BOOTSTRAP_KEY, JSON.stringify(merged)); } catch (_) {}
    return merged;
  }
  function storageMode() {
    const b = getBootstrap();
    return (b.storageMode === 'sheet' && b.appsScriptUrl) ? 'sheet' : 'local';
  }
  // Point CONFIG.DATA_SOURCE / APPS_SCRIPT_URL at the chosen store. Call at boot.
  function applyBootstrap() {
    const b = getBootstrap();
    if (b.storageMode === 'sheet' && b.appsScriptUrl) {
      CFG.DATA_SOURCE = 'appsscript';
      CFG.APPS_SCRIPT_URL = b.appsScriptUrl;
    } else {
      CFG.DATA_SOURCE = 'local';
    }
  }

  // ---------- exam settings ----------
  function applyExam(s) {
    if (!s) return;
    if (s.examName  != null && s.examName  !== '') CFG.EXAM_NAME = s.examName;
    if (s.examDate  != null) CFG.EXAM_DATE = s.examDate;
    if (s.prepStart != null) CFG.PREP_START = s.prepStart;
    if (s.dailyGoal != null) CFG.DAILY_HOURS_GOAL = Number(s.dailyGoal) || CFG.DAILY_HOURS_GOAL;
    if (s.subjectMax && typeof s.subjectMax === 'object') {
      CFG.SUBJECTS.forEach(sub => { if (s.subjectMax[sub.key] != null) sub.max = Number(s.subjectMax[sub.key]) || sub.max; });
    }
  }
  function applyLocalExam() {
    try { applyExam(JSON.parse(localStorage.getItem(CFG.SETTINGS_KEY))); } catch (_) {}
  }
  function getExam() {
    return {
      examName: CFG.EXAM_NAME,
      examDate: CFG.EXAM_DATE,
      prepStart: CFG.PREP_START,
      dailyGoal: CFG.DAILY_HOURS_GOAL,
      subjectMax: Object.fromEntries(CFG.SUBJECTS.map(s => [s.key, s.max])),
    };
  }
  function saveExamLocal(obj) {
    applyExam(obj);
    try { localStorage.setItem(CFG.SETTINGS_KEY, JSON.stringify(getExam())); } catch (_) {}
  }

  const isConfigured = () => storageMode() === 'sheet' || !!localStorage.getItem(CFG.SETTINGS_KEY);

  return {
    getBootstrap, saveBootstrap, storageMode, applyBootstrap,
    applyExam, applyLocalExam, getExam, saveExamLocal, isConfigured,
  };
})();
