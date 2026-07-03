/* ============================================================
   settings.js — user-editable exam settings (persisted locally)
   ------------------------------------------------------------
   Reads/writes localStorage and mirrors the values onto window.CONFIG
   so the rest of the app keeps reading CONFIG unchanged.
   ============================================================ */
window.Settings = (function () {
  const CFG = window.CONFIG;

  function load() {
    try { return JSON.parse(localStorage.getItem(CFG.SETTINGS_KEY)) || null; }
    catch (_) { return null; }
  }

  // Push saved settings onto CONFIG. Call once at boot (before first render).
  function apply() {
    const s = load();
    if (!s) return;
    if (s.examName  != null) CFG.EXAM_NAME = s.examName;
    if (s.examDate  != null) CFG.EXAM_DATE = s.examDate;
    if (s.prepStart != null) CFG.PREP_START = s.prepStart;
    if (s.dailyGoal != null) CFG.DAILY_HOURS_GOAL = Number(s.dailyGoal) || CFG.DAILY_HOURS_GOAL;
    if (s.subjectMax && typeof s.subjectMax === 'object') {
      CFG.SUBJECTS.forEach(sub => { if (s.subjectMax[sub.key] != null) sub.max = Number(s.subjectMax[sub.key]) || sub.max; });
    }
  }

  // Current effective values (for populating the form).
  function get() {
    return {
      examName: CFG.EXAM_NAME,
      examDate: CFG.EXAM_DATE,
      prepStart: CFG.PREP_START,
      dailyGoal: CFG.DAILY_HOURS_GOAL,
      subjectMax: Object.fromEntries(CFG.SUBJECTS.map(s => [s.key, s.max])),
    };
  }

  function save(partial) {
    const merged = Object.assign(get(), partial);
    try { localStorage.setItem(CFG.SETTINGS_KEY, JSON.stringify(merged)); } catch (_) {}
    apply();
    return merged;
  }

  const isConfigured = () => !!load();

  return { apply, get, save, isConfigured };
})();
