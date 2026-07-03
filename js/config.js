/* ============================================================
   config.js — defaults & data source
   ============================================================
   DATA_SOURCE:
     'local'      -> you enter data in the UI; saved in your browser (default)
     'appsscript' -> reads JSON from a Google Apps Script Web App
     'csv'        -> reads two published Google Sheet CSV URLs

   With 'local' you never touch a spreadsheet — use the ＋ Log Study /
   ＋ Add Mock buttons and the ⚙ Settings dialog. Everything is stored
   in this browser (localStorage) and persists across reloads.
   ============================================================ */

window.CONFIG = {
  // 'local' | 'appsscript' | 'csv'
  DATA_SOURCE: 'local',

  // ---------------- EXAM DEFAULTS ----------------
  // These are just fallbacks — the real values are set in the ⚙ Settings
  // dialog (asked on first run) and saved in your browser.
  EXAM_NAME: 'My Exam',
  EXAM_DATE: '',                 // yyyy-mm-dd  (blank -> Settings dialog opens on first run)
  PREP_START: '',                // yyyy-mm-dd  (blank -> uses your earliest study log)

  // Subjects (order + colour + max marks per section). `max` scales the radar/score bars.
  SUBJECTS: [
    { key: 'quant',     label: 'Quant',     color: '#5b93ff', max: 50 },
    { key: 'reasoning', label: 'Reasoning', color: '#a970ff', max: 50 },
    { key: 'english',   label: 'English',   color: '#2fd980', max: 50 },
    { key: 'ga',        label: 'GA',        color: '#ffb02e', max: 50 },
  ],

  // A healthy daily study target (hrs) — used for the goal line & insights.
  DAILY_HOURS_GOAL: 6,

  // --- Optional: Google Apps Script Web App (only if DATA_SOURCE = 'appsscript') ---
  APPS_SCRIPT_URL: '',

  // --- Optional: Published-to-web CSV links (only if DATA_SOURCE = 'csv') ---
  STUDY_CSV_URL: '',   // columns: Date, Subject, Hours
  MOCK_CSV_URL:  '',   // columns: Date, Name, Quant, Reasoning, English, GA, Cutoff

  // Auto-refresh interval in ms for the live (network) sources. Ignored for 'local'.
  REFRESH_INTERVAL: 5 * 60 * 1000,

  LOCALE: 'en-IN',

  // localStorage keys
  STUDY_KEY:    'epd_study_v1',
  MOCK_KEY:     'epd_mocks_v1',
  SETTINGS_KEY: 'epd_settings_v1',
  BOOTSTRAP_KEY:'epd_bootstrap_v1',   // storage mode + web-app URL (always local)
  INIT_KEY:     'epd_init_v1',
  THEME_KEY:    'epd_theme',
  CACHE_KEY:    'epd_cache_v1',   // used only by network sources
  CACHE_TTL:    6 * 60 * 60 * 1000,
};
