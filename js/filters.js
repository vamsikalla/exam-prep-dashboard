/* ============================================================
   filters.js — subject / search / sort filtering for study logs
   ------------------------------------------------------------
   State lives here; app.js reads state and calls apply().
   ============================================================ */
window.Filters = (function () {
  const state = {
    search: '',
    subjects: new Set(),   // empty = all
    sort: 'newest',
  };

  function apply(study) {
    let rows = study;

    if (state.subjects.size)
      rows = rows.filter(s => state.subjects.has(s.subject));

    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(s => s.subject.toLowerCase().includes(q));
    }

    return sortRows(rows.slice());
  }

  function sortRows(rows) {
    switch (state.sort) {
      case 'oldest':  rows.sort((a,b) => a.date - b.date); break;
      case 'highest': rows.sort((a,b) => b.hours - a.hours); break;
      case 'lowest':  rows.sort((a,b) => a.hours - b.hours); break;
      case 'alpha':   rows.sort((a,b) => a.subject.localeCompare(b.subject)); break;
      case 'newest':
      default:        rows.sort((a,b) => b.date - a.date);
    }
    return rows;
  }

  const isActive = () => state.search || state.subjects.size;

  function reset() {
    state.search = ''; state.subjects.clear(); state.sort = 'newest';
  }

  return { state, apply, sortRows, isActive, reset };
})();
