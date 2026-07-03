# 🎯 Exam Prep Tracker

A premium, single-page **study-hours + mock-score + countdown** analytics dashboard for exam
preparation — the study-plan sibling of the Expense Analytics Dashboard. Same tech, same look,
same "point it at a Google Sheet and go" workflow.

It answers, at a glance:

- ⏳ **How many days until my exam?** (live countdown + preparation-progress bar)
- 📚 **How many hours am I studying?** — per day / week / month / year, by subject
- 📝 **How many mocks am I attempting, and how am I scoring?** — GA, Quant, English, Reasoning
- ✅ **Am I clearing the cutoff?** — every mock's score vs the cutoff you entered for it
- 🔎 **Where should I focus?** — weakest subject, streaks, trend, clearance rate

**No spreadsheet needed.** You enter everything in the app itself and it saves to your browser.

👉 **Live demo:** https://vamsikalla.github.io/exam-prep-dashboard/

---

## 🚀 Quick start

Just open `index.html` (or the live link above). On first run it asks for your **exam date**, then
you're ready:

- **＋ Log Study** — date · subject · hours
- **＋ Add Mock** — date · name · Quant / Reasoning / English / GA scores · cutoff (total & pass/fail computed live)
- **⚙ Settings** — exam name & date, prep-start date, daily-hours goal, marks-per-section

Everything is saved in **your browser** (localStorage) and persists across reloads. Nothing leaves
your device. Want to explore first? Open **⚙ Settings → Load sample data**. Wipe it anytime with
**Clear all data**.

To run locally:

```bash
cd exam-prep-dashboard
python3 -m http.server 8000
# open http://localhost:8000
```

---

## ⚙️ What you track

**Study log** — hours per subject per day. Subject is free text: the four exam sections plus
anything else (Revision, Current Affairs…).

**Mocks** — per-section scores (Quant, Reasoning, English, GA) plus the **cutoff** for that mock.
Total is auto-summed; the app tells you if you cleared and by how much.

Set marks-per-section in **⚙ Settings** so the radar and score bars scale to your exam.

---

## ☁️ Store & sync via Google Sheets (optional)

Local storage is per-browser and per-device. Want your data to **live in your Google account and
sync across devices** (laptop, phone, another browser)? Switch on Sheet storage — right inside the app,
no code editing:

1. Create a **blank Google Sheet** (the tabs are created for you automatically).
2. **Extensions ▸ Apps Script**, delete any code, paste `apps-script/Code.gs`, and Save.
3. **Deploy ▸ New deployment ▸ Web app** — *Execute as: Me*, *Who has access: Anyone*. Authorise.
4. Copy the `/exec` URL → in the app open **⚙ Settings → “☁️ Google Sheet”**, paste the URL,
   **Test connection**, then **Save settings**.

From then on every add/delete **writes to the sheet** and the app **reads from it**. If you already
had local entries, it offers to upload them to the sheet on first switch. Open the same page with the
same URL on any device to see the same data. Flip back to **💾 This browser** anytime.

The sheet gets three tabs — `StudyLog` (Date, Subject, Hours), `Mocks` (Date, Name, Quant, Reasoning,
English, GA, Total, Cutoff), and `Settings` — each row carries an `id` so edits/deletes stay in sync.

*(Prefer read-only published CSVs instead? Set `STUDY_CSV_URL` / `MOCK_CSV_URL` and
`DATA_SOURCE: 'csv'` in `js/config.js`.)*

---

## 📊 What's on the dashboard

**Countdown hero** — days to exam (turns amber ≤30 days, red ≤14), weeks left, and a
preparation-progress bar (how far through your prep window you are).

**Summary cards** (adapt to the daily/weekly/monthly/yearly toggle):
- Study hours in the period · Average hours/day vs goal · Mocks attempted (and how many cleared) · Best mock score vs cutoff

**Mock hero** — your latest (or best-in-period) mock: total vs cutoff with a marker line, a
cleared/short badge, and a per-subject breakdown.

**Study Analysis** — hours trend, time-by-subject donut, daily-hours bars with a goal line.

**Mock Performance** — score-vs-cutoff over time, subject-strengths radar (avg vs best),
average score by subject vs max, and cutoff margin per mock (how far above/below you landed).

**Consistency & Activity** — a study calendar heatmap (hours per day, green when you hit the goal)
and a mock timeline (✓ cleared / ✕ missed).

**Smart Insights** — auto-generated: countdown urgency, hours vs last period, streaks,
latest mock result, improvement trend, clearance rate, and your focus subject.

Plus: dark/light theme, PDF / PNG / CSV export, subject filter, search, and 5-min auto-refresh
when connected to a live sheet.

---

## 🗂️ Project structure

```
exam-prep-dashboard/
├── index.html            # layout + script order
├── css/
│   ├── themes.css        # dark/light design tokens
│   └── styles.css        # components, countdown, heroes, responsive
├── js/
│   ├── config.js         # defaults & data source
│   ├── utils.js          # dates, formatting, colors, subject meta
│   ├── settings.js       # user exam settings (persisted)
│   ├── data.js           # localStorage CRUD + optional network sources
│   ├── aggregations.js   # countdown, study & mock analytics, insights
│   ├── filters.js        # subject/search/sort
│   ├── charts.js         # ECharts visualisations
│   ├── ui.js             # cards, countdown, heroes, calendar, lists
│   ├── forms.js          # ⭐ data-entry modals (study / mock / settings)
│   ├── export.js         # CSV/PNG/PDF
│   └── app.js            # orchestration
├── apps-script/Code.gs   # optional: Google Sheets → JSON web app
└── docs/ARCHITECTURE.md
```

Built with vanilla JS + [ECharts](https://echarts.apache.org/). No build step, no framework.
