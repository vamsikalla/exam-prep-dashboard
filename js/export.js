/* ============================================================
   export.js — CSV / PNG / PDF export
   ============================================================ */
window.Exporter = (function () {
  const CFG = window.CONFIG;

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = U.el('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }

  // ---- CSV (mocks — the analysis-worthy table) ----
  function csv(mocks) {
    const subs = (CFG.SUBJECTS || []);
    const header = ['Date', 'Name', ...subs.map(s => s.label), 'Total', 'Cutoff', 'Margin', 'Result'];
    const lines = [header.join(',')];
    mocks.forEach(m => {
      const row = [
        U.isoDate(m.date),
        `"${String(m.name).replace(/"/g,'""')}"`,
        ...subs.map(s => m.scores[s.key] ?? 0),
        m.total, m.cutoff, (m.total - m.cutoff),
        m.total >= m.cutoff ? 'Cleared' : 'Missed',
      ];
      lines.push(row.join(','));
    });
    download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `mocks_${U.isoDate(new Date())}.csv`);
    U.toast('CSV exported ✔');
  }

  // ---- PNG (whole dashboard viewport) ----
  async function png() {
    U.toast('Rendering PNG…');
    const target = document.querySelector('.container');
    const canvas = await html2canvas(target, {
      backgroundColor: U.cssVar('--bg-1'),
      scale: 2, useCORS: true, logging: false,
      windowWidth: target.scrollWidth,
    });
    canvas.toBlob(b => { download(b, `prep_dashboard_${U.isoDate(new Date())}.png`); U.toast('PNG exported ✔'); });
  }

  // ---- PDF ----
  async function pdf(meta) {
    U.toast('Building PDF…');
    const { jsPDF } = window.jspdf;
    const target = document.querySelector('.container');
    const canvas = await html2canvas(target, { backgroundColor: U.cssVar('--bg-1'), scale: 2, useCORS: true, logging: false });
    const img = canvas.toDataURL('image/png');
    const pdfW = 595.28; // A4 portrait pt
    const ratio = pdfW / canvas.width;
    const pdfH = canvas.height * ratio;
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pdfW, pdfH + 60] });
    doc.setFillColor(5, 7, 15); doc.rect(0, 0, pdfW, pdfH + 60, 'F');
    doc.setTextColor(255); doc.setFontSize(16);
    doc.text(`${CFG.EXAM_NAME} — Prep Report`, 24, 30);
    doc.setFontSize(10); doc.setTextColor(160);
    doc.text(`${meta.label || ''}  ·  Generated ${new Date().toLocaleString(CFG.LOCALE)}`, 24, 46);
    doc.addImage(img, 'PNG', 0, 56, pdfW, pdfH);
    doc.save(`prep_report_${U.isoDate(new Date())}.pdf`);
    U.toast('PDF exported ✔');
  }

  return { csv, png, pdf };
})();
