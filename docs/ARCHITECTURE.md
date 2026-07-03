# Architecture

Single-page app, vanilla JS, no build step. Scripts load in dependency order (see `index.html`)
and each attaches one global: `CONFIG`, `U`, `DataStore`, `Agg`, `Filters`, `Charts`, `UI`, `Exporter`, `app`.

## Data flow

```
config.js ──► DataStore.load()
                 │  (mock | appsscript | csv)
                 ▼
        { study:[{date,subject,hours}],
          mocks:[{date,name,scores:{quant,reasoning,english,ga},total,cutoff}] }
                 │  onUpdate
                 ▼
   app.rebuild() ─► buildContext() ─► Agg.* ─► Charts.render / UI.* 
                 ▲
   any UI change (period, date, filter, theme) ─► app.rerender()
```

- **`buildContext()`** applies subject/search/sort filters to study logs, slices both study and
  mocks to the selected period, and returns everything the renderers need.
- **`Agg`** is pure functions only — no DOM. `countdown()`, `studyTrend()`, `dailyHours()`,
  `studyStreak()`, `subjectAverages()`, `mockSeries()`, `clearanceRate()`, `insights()`.
- **`Charts`** reads CSS custom properties each render so it re-themes on toggle.
- **`UI`** owns all DOM writes (cards, countdown hero, mock hero, calendar, timeline, insights).

## Two data streams, one dashboard

Unlike the expense tracker (one stream + a budget table), this app blends **study logs** and
**mock results**:

| Concept        | Expense tracker      | Exam prep tracker            |
|----------------|----------------------|------------------------------|
| Primary stream | expenses (Date/Cat/Amt) | study logs (Date/Subject/Hours) |
| Secondary      | monthly budgets       | mocks (per-subject scores + cutoff) |
| "vs" hero      | Allocated vs Spent    | Score vs Cutoff              |
| Heatmap        | ₹ spent per day       | hours studied per day        |

## Adding a subject

Add an entry to `CONFIG.SUBJECTS` (`key`, `label`, `color`, `max`). The mock parser, radar,
average-by-subject bar, mock hero chips, and CSV export all iterate that list, so nothing else
needs to change. Add a matching column (header = the `key` or `label`) to your Mocks sheet.

## Storage layer

`DataStore` is storage-agnostic and has two backends, chosen by `Settings` (persisted in
`epd_bootstrap_v1`):

- **local** (default) — study/mocks in `localStorage` (`epd_study_v1`, `epd_mocks_v1`), exam
  settings in `epd_settings_v1`. Mutations are synchronous but exposed as Promises for a uniform API.
- **sheet** — a Google Apps Script Web App (`apps-script/Code.gs`). `doGet` returns
  `{study, mocks, settings}`; `doPost` handles `addStudy` / `addMock` / `deleteStudy` /
  `deleteMock` / `saveSettings` / `clearAll` / `import`. Writes POST as a *simple* request
  (`text/plain`, so no CORS preflight — which Apps Script can't answer), then the client re-`GET`s
  so the sheet stays the single source of truth. Each row carries an `id` for deletes.

Every mutation (`addStudy`, `deleteMock`, …) returns a Promise and works identically in both modes,
so `forms.js` just `await`s them and the `onUpdate` subscription re-renders. In sheet mode the exam
settings ride along with the data and are applied to `CONFIG` in `app.rebuild()`.
