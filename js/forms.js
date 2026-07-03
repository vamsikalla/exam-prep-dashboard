/* ============================================================
   forms.js — data-entry modals (study, mock, settings + storage)
   ------------------------------------------------------------
   Writes go through DataStore (async in both local & sheet modes).
   The dashboard re-renders via DataStore's onUpdate subscription.
   ============================================================ */
window.Forms = (function () {
  const CFG = window.CONFIG;

  function openModal(id) {
    const m = U.$('#' + id);
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    const first = m.querySelector('input, select, button.primary');
    if (first) setTimeout(() => first.focus(), 60);
  }
  function closeAll() { U.$$('.modal-backdrop').forEach(m => m.classList.remove('open')); document.body.style.overflow = ''; }

  const setBusy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (on) { btn._t = btn.textContent; btn.textContent = label || 'Saving…'; } else if (btn._t) btn.textContent = btn._t; };

  // ---------- dynamic subject fields ----------
  function buildSubjectFields() {
    const scoreBox = U.$('#mockScoreFields'); scoreBox.innerHTML = '';
    CFG.SUBJECTS.forEach(s => {
      const f = U.el('label', 'field');
      f.innerHTML = `<span class="field-label"><span class="dot" style="background:${s.color}"></span>${s.label} <em>/ ${s.max}</em></span>
        <input type="number" min="0" max="${s.max}" step="1" data-score="${s.key}" placeholder="0" />`;
      scoreBox.appendChild(f);
    });
    scoreBox.querySelectorAll('input').forEach(i => i.addEventListener('input', updateMockTotal));

    const maxBox = U.$('#settingsMaxFields'); maxBox.innerHTML = '';
    CFG.SUBJECTS.forEach(s => {
      const f = U.el('label', 'field');
      f.innerHTML = `<span class="field-label"><span class="dot" style="background:${s.color}"></span>${s.label} max</span>
        <input type="number" min="1" step="1" data-max="${s.key}" value="${s.max}" />`;
      maxBox.appendChild(f);
    });
  }

  function updateMockTotal() {
    const total = U.sum(U.$$('#mockScoreFields input').map(i => Number(i.value) || 0));
    U.$('#fMockTotal').textContent = total;
    const cutoff = Number(U.$('#fMockCutoff').value) || 0;
    const badge = U.$('#fMockVerdict');
    if (cutoff > 0) { const ok = total >= cutoff;
      badge.textContent = ok ? `✅ Cleared by ${total - cutoff}` : `❌ Short by ${cutoff - total}`;
      badge.className = 'mock-verdict ' + (ok ? 'good' : 'bad');
    } else { badge.textContent = ''; badge.className = 'mock-verdict'; }
  }

  // ---------- open modals ----------
  function openStudy() {
    U.$('#fStudyDate').value = U.isoDate(new Date());
    U.$('#fStudySubject').value = ''; U.$('#fStudyHours').value = '';
    const list = U.$('#subjectOptions'); list.innerHTML = '';
    new Set([...CFG.SUBJECTS.map(s=>s.label), 'Current Affairs', 'Revision', 'Mock Analysis', ...DataStore.data.study.map(s=>s.subject)])
      .forEach(s => { const o = U.el('option'); o.value = s; list.appendChild(o); });
    openModal('studyModal');
  }
  function openMock() {
    U.$('#fMockDate').value = U.isoDate(new Date());
    U.$('#fMockName').value = DataStore.nextMockName();
    U.$('#fMockCutoff').value = '';
    U.$$('#mockScoreFields input').forEach(i => i.value = '');
    updateMockTotal();
    openModal('mockModal');
  }
  function setStorageUI(mode) {
    U.$$('#storageSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.storage === mode));
    U.$('#sheetFields').style.display = mode === 'sheet' ? 'flex' : 'none';
  }
  function currentStorageChoice() {
    const active = U.$('#storageSeg .seg-btn.active');
    return active ? active.dataset.storage : 'local';
  }
  function openSettings(firstRun) {
    const s = Settings.getExam(), b = Settings.getBootstrap();
    U.$('#fExamName').value = s.examName || '';
    U.$('#fExamDate').value = s.examDate || U.isoDate(U.addDays(new Date(), 90));
    U.$('#fPrepStart').value = s.prepStart || U.isoDate(new Date());
    U.$('#fDailyGoal').value = s.dailyGoal || 6;
    U.$$('#settingsMaxFields input').forEach(i => { i.value = s.subjectMax[i.dataset.max] ?? i.value; });
    U.$('#fSheetUrl').value = b.appsScriptUrl || '';
    U.$('#sheetStatus').textContent = ''; U.$('#sheetStatus').className = 'sheet-status';
    setStorageUI(Settings.storageMode());
    U.$('#settingsFirstRunNote').style.display = firstRun ? 'flex' : 'none';
    openModal('settingsModal');
  }

  function readExamForm() {
    const subjectMax = {}; U.$$('#settingsMaxFields input').forEach(i => subjectMax[i.dataset.max] = Number(i.value)||1);
    return {
      examName: U.$('#fExamName').value.trim() || 'My Exam',
      examDate: U.$('#fExamDate').value,
      prepStart: U.$('#fPrepStart').value,
      dailyGoal: Number(U.$('#fDailyGoal').value) || 6,
      subjectMax,
    };
  }

  // ---------- init ----------
  function init() {
    buildSubjectFields();

    // Log study
    U.$('#studyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || U.$('#studyForm button.primary');
      setBusy(btn, true);
      try {
        const entry = await DataStore.addStudy({ date: U.$('#fStudyDate').value, subject: U.$('#fStudySubject').value.trim() || 'General', hours: U.$('#fStudyHours').value });
        U.toast(`Logged ${U.fmtHours(entry.hours)} of ${entry.subject} ✔`); closeAll();
      } catch (err) { U.toast(err.message || 'Could not save'); }
      finally { setBusy(btn, false); }
    });

    // Add mock
    U.$('#mockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || U.$('#mockForm button.primary');
      setBusy(btn, true);
      try {
        const scores = {}; U.$$('#mockScoreFields input').forEach(i => scores[i.dataset.score] = i.value);
        const entry = await DataStore.addMock({ date: U.$('#fMockDate').value, name: U.$('#fMockName').value.trim(), scores, cutoff: U.$('#fMockCutoff').value });
        U.toast(`Saved ${entry.name}: ${entry.total} ✔`); closeAll();
      } catch (err) { U.toast(err.message || 'Could not save'); }
      finally { setBusy(btn, false); }
    });
    U.$('#fMockCutoff').addEventListener('input', updateMockTotal);

    // Storage toggle + test
    U.$$('#storageSeg .seg-btn').forEach(b => b.addEventListener('click', () => setStorageUI(b.dataset.storage)));
    U.$('#btnTestSheet').addEventListener('click', async () => {
      const url = U.$('#fSheetUrl').value.trim();
      const st = U.$('#sheetStatus');
      if (!url) { st.textContent = 'Paste your Web App URL first.'; st.className = 'sheet-status bad'; return; }
      st.textContent = 'Testing…'; st.className = 'sheet-status';
      try { const d = await DataStore.testSheet(url); st.textContent = `✅ Connected — ${d.study.length} study logs, ${d.mocks.length} mocks in the sheet.`; st.className = 'sheet-status good'; }
      catch (e) { st.textContent = '❌ Could not reach it. Check the URL and that the Web App is deployed to “Anyone”.'; st.className = 'sheet-status bad'; }
    });

    // Save settings
    U.$('#settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || U.$('#settingsForm button.primary');
      const exam = readExamForm();
      const mode = currentStorageChoice();
      setBusy(btn, true);
      try {
        if (mode === 'sheet') {
          const url = U.$('#fSheetUrl').value.trim();
          if (!url) { U.toast('Paste your Web App URL'); setBusy(btn, false); return; }
          let sheetData;
          try { sheetData = await DataStore.testSheet(url); }
          catch (_) { U.$('#sheetStatus').textContent = '❌ Could not reach the sheet — settings not switched.'; U.$('#sheetStatus').className = 'sheet-status bad'; setBusy(btn, false); return; }
          // switch config to the sheet
          Settings.saveBootstrap({ storageMode: 'sheet', appsScriptUrl: url });
          CFG.DATA_SOURCE = 'appsscript'; CFG.APPS_SCRIPT_URL = url;
          Settings.applyExam(exam);
          await DataStore.saveSettings(exam);
          // offer to migrate existing local entries into an empty sheet
          const local = DataStore.localCounts();
          if ((sheetData.study.length + sheetData.mocks.length) === 0 && local.total > 0 &&
              confirm(`Upload your ${local.total} existing local ${local.total===1?'entry':'entries'} to this Google Sheet?`)) {
            await DataStore.importLocalToSheet();
          }
          await DataStore.load();
          U.toast('Connected to Google Sheet ✔');
        } else {
          Settings.saveBootstrap({ storageMode: 'local', appsScriptUrl: U.$('#fSheetUrl').value.trim() });
          CFG.DATA_SOURCE = 'local';
          Settings.saveExamLocal(exam);
          await DataStore.load();
          U.toast('Settings saved ✔');
        }
        UI.setStatus(statusText());
        closeAll();
      } catch (err) { U.toast(err.message || 'Could not save settings'); }
      finally { setBusy(btn, false); }
    });

    // Data management
    U.$('#btnLoadSample').addEventListener('click', async () => {
      if (!confirm('Replace current data with sample data?')) return;
      try { await DataStore.loadSample(); U.toast('Sample data loaded ✔'); closeAll(); } catch (e) { U.toast(e.message || 'Failed'); }
    });
    U.$('#btnClearAll').addEventListener('click', async () => {
      if (!confirm('Delete ALL your study logs and mocks? This cannot be undone.')) return;
      try { await DataStore.clearAll(); U.toast('All data cleared'); closeAll(); } catch (e) { U.toast(e.message || 'Failed'); }
    });

    // Open buttons
    U.$('#addStudyBtn').addEventListener('click', openStudy);
    U.$('#addMockBtn').addEventListener('click', openMock);
    U.$('#settingsBtn').addEventListener('click', () => openSettings(false));

    // Close controls
    U.$$('.modal-backdrop').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m) closeAll(); }));
    U.$$('[data-close]').forEach(b => b.addEventListener('click', () => closeAll()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

    // Delete via delegation
    document.addEventListener('click', async (e) => {
      const dm = e.target.closest('[data-del-mock]');
      const ds = e.target.closest('[data-del-study]');
      if (!dm && !ds) return;
      try {
        if (dm) { await DataStore.deleteMock(dm.dataset.delMock); U.toast('Mock deleted'); }
        if (ds) { await DataStore.deleteStudy(ds.dataset.delStudy); U.toast('Session deleted'); }
      } catch (err) { U.toast(err.message || 'Delete failed'); }
    });
  }

  function statusText() {
    const src = Settings.storageMode() === 'sheet' ? '☁️ Google Sheet' : '💾 Saved in this browser';
    const sN = DataStore.data.study.length, mN = DataStore.data.mocks.length;
    return `${src} · ${sN} logs · ${mN} mocks`;
  }

  return { init, openStudy, openMock, openSettings, closeAll, statusText };
})();
