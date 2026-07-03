/* ============================================================
   forms.js — data-entry modals (study, mock, settings)
   ------------------------------------------------------------
   Builds the dynamic subject fields, opens/closes modals, and
   writes through DataStore / Settings. Changes propagate via
   DataStore's onUpdate subscription (add/delete) and refresh()
   (settings), so the whole dashboard re-renders automatically.
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
  function closeModal(el) {
    const m = el.closest ? el.closest('.modal-backdrop') : el;
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
  }
  function closeAll() { U.$$('.modal-backdrop').forEach(m => m.classList.remove('open')); document.body.style.overflow = ''; }

  // ---------- build dynamic subject fields ----------
  function buildSubjectFields() {
    const scoreBox = U.$('#mockScoreFields');
    scoreBox.innerHTML = '';
    CFG.SUBJECTS.forEach(s => {
      const f = U.el('label', 'field');
      f.innerHTML = `<span class="field-label"><span class="dot" style="background:${s.color}"></span>${s.label} <em>/ ${s.max}</em></span>
        <input type="number" min="0" max="${s.max}" step="1" data-score="${s.key}" placeholder="0" />`;
      scoreBox.appendChild(f);
    });
    scoreBox.querySelectorAll('input').forEach(i => i.addEventListener('input', updateMockTotal));

    const maxBox = U.$('#settingsMaxFields');
    if (maxBox) {
      maxBox.innerHTML = '';
      CFG.SUBJECTS.forEach(s => {
        const f = U.el('label', 'field');
        f.innerHTML = `<span class="field-label"><span class="dot" style="background:${s.color}"></span>${s.label} max</span>
          <input type="number" min="1" step="1" data-max="${s.key}" value="${s.max}" />`;
        maxBox.appendChild(f);
      });
    }
  }

  function updateMockTotal() {
    const total = U.sum(U.$$('#mockScoreFields input').map(i => Number(i.value) || 0));
    U.$('#fMockTotal').textContent = total;
    const cutoff = Number(U.$('#fMockCutoff').value) || 0;
    const badge = U.$('#fMockVerdict');
    if (cutoff > 0) {
      const ok = total >= cutoff;
      badge.textContent = ok ? `✅ Cleared by ${total - cutoff}` : `❌ Short by ${cutoff - total}`;
      badge.className = 'mock-verdict ' + (ok ? 'good' : 'bad');
    } else { badge.textContent = ''; badge.className = 'mock-verdict'; }
  }

  // ---------- open specific modals ----------
  function openStudy() {
    U.$('#fStudyDate').value = U.isoDate(new Date());
    U.$('#fStudySubject').value = '';
    U.$('#fStudyHours').value = '';
    // refresh subject suggestions
    const list = U.$('#subjectOptions'); list.innerHTML = '';
    const known = new Set([...CFG.SUBJECTS.map(s => s.label), 'Current Affairs', 'Revision', 'Mock Analysis',
      ...DataStore.data.study.map(s => s.subject)]);
    known.forEach(s => { const o = U.el('option'); o.value = s; list.appendChild(o); });
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
  function openSettings(firstRun) {
    const s = Settings.get();
    U.$('#fExamName').value = s.examName || '';
    U.$('#fExamDate').value = s.examDate || suggestExamDate();
    U.$('#fPrepStart').value = s.prepStart || U.isoDate(new Date());
    U.$('#fDailyGoal').value = s.dailyGoal || 6;
    U.$$('#settingsMaxFields input').forEach(i => { i.value = s.subjectMax[i.dataset.max] ?? i.value; });
    U.$('#settingsFirstRunNote').style.display = firstRun ? 'flex' : 'none';
    openModal('settingsModal');
  }
  function suggestExamDate() {
    const d = U.addDays(new Date(), 90); return U.isoDate(d);
  }

  // ---------- submit handlers ----------
  function init() {
    buildSubjectFields();

    U.$('#studyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const entry = DataStore.addStudy({
        date: U.$('#fStudyDate').value,
        subject: U.$('#fStudySubject').value.trim() || 'General',
        hours: U.$('#fStudyHours').value,
      });
      if (entry) { U.toast(`Logged ${U.fmtHours(entry.hours)} of ${entry.subject} ✔`); closeAll(); }
      else U.toast('Enter a valid date & hours');
    });

    U.$('#mockForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const scores = {};
      U.$$('#mockScoreFields input').forEach(i => scores[i.dataset.score] = i.value);
      const entry = DataStore.addMock({
        date: U.$('#fMockDate').value,
        name: U.$('#fMockName').value.trim(),
        scores,
        cutoff: U.$('#fMockCutoff').value,
      });
      if (entry) { U.toast(`Saved ${entry.name}: ${entry.total} ✔`); closeAll(); }
      else U.toast('Enter a valid date');
    });
    U.$('#fMockCutoff').addEventListener('input', updateMockTotal);

    U.$('#settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const subjectMax = {};
      U.$$('#settingsMaxFields input').forEach(i => subjectMax[i.dataset.max] = Number(i.value) || 1);
      Settings.save({
        examName: U.$('#fExamName').value.trim() || 'My Exam',
        examDate: U.$('#fExamDate').value,
        prepStart: U.$('#fPrepStart').value,
        dailyGoal: Number(U.$('#fDailyGoal').value) || 6,
        subjectMax,
      });
      U.toast('Settings saved ✔');
      closeAll();
      DataStore.refresh();   // re-emit -> full re-render with new exam/goal/max
    });

    // data management
    U.$('#btnLoadSample').addEventListener('click', () => {
      if (confirm('Replace current data with sample data?')) { DataStore.loadSample(); U.toast('Sample data loaded ✔'); closeAll(); }
    });
    U.$('#btnClearAll').addEventListener('click', () => {
      if (confirm('Delete ALL your study logs and mocks? This cannot be undone.')) { DataStore.clearAll(); U.toast('All data cleared'); closeAll(); }
    });

    // open buttons
    U.$('#addStudyBtn').addEventListener('click', openStudy);
    U.$('#addMockBtn').addEventListener('click', openMock);
    U.$('#settingsBtn').addEventListener('click', () => openSettings(false));

    // close controls (backdrop click, ✕, cancel)
    U.$$('.modal-backdrop').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(m); }));
    U.$$('[data-close]').forEach(b => b.addEventListener('click', () => closeAll()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

    // delete via delegation (mock timeline + study list)
    document.addEventListener('click', (e) => {
      const dm = e.target.closest('[data-del-mock]');
      const ds = e.target.closest('[data-del-study]');
      if (dm) { DataStore.deleteMock(dm.dataset.delMock); U.toast('Mock deleted'); }
      if (ds) { DataStore.deleteStudy(ds.dataset.delStudy); U.toast('Session deleted'); }
    });
  }

  return { init, openStudy, openMock, openSettings, closeAll };
})();
