// หน้า 4: ประวัติ (Transaction History) + export CSV
window.WMS = window.WMS || {};
WMS.pages = WMS.pages || {};
WMS.pages.history = (function (W) {
  let el, filter = 'all';
  const SHOW = 200;

  const filtered = (state) => state.tx.filter((t) => filter === 'all' || t.type === filter);

  function render(state) {
    if (!state.ready) { el.innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>'; return; }
    const list = filtered(state);
    const chips = [['all', 'ทั้งหมด'], ['in', 'รับเข้า'], ['out', 'จ่ายออก']].map(([k, l]) =>
      `<button class="chip-btn ${filter === k ? 'on' : ''}" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('');
    el.innerHTML = `<div class="hist-bar"><div class="chips">${chips}</div>
        <button class="btn ghost sm" data-act="csv" ${list.length ? '' : 'disabled'}>${W.icon.download} CSV</button></div>
      <p class="muted count">${list.length} รายการ${list.length > SHOW ? ` · แสดง ${SHOW} ล่าสุด (CSV ได้ครบทั้งหมด)` : ''}</p>
      <div class="tx-list">${list.slice(0, SHOW).map((t) => `
        <div class="tx ${t.type}">
          <div class="tx-ic" aria-hidden="true">${t.type === 'in' ? W.icon.arrowIn : W.icon.arrowOut}</div>
          <div class="tx-main">
            <div class="tx-top"><b>${W.h(t.lot)}</b><span class="tx-type">${t.type === 'in' ? 'รับเข้า' : 'จ่ายออก'}${t.undo ? ' (ยกเลิกหยิบ)' : ''}</span></div>
            <div class="tx-sub">${W.h(t.color)} · ${W.fmtQty(t.qty)} ${W.unit} · <span class="loc">${W.h(t.loc)}</span>${t.by ? ` · <span class="by">${W.h(W.auth.short(t.by))}</span>` : ''}</div>
          </div>
          <time class="tx-time">${W.fmtTime(t.ts)}</time>
        </div>`).join('') || '<p class="empty">ยังไม่มีรายการ</p>'}</div>`;
  }

  function exportCsv() {
    const list = filtered(W.db.state);
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['เวลา', 'ประเภท', 'Lot', 'D/O', 'สี', 'จำนวน', 'ตำแหน่ง', 'หมายเหตุ', 'ผู้ทำรายการ'];
    const lines = list.map((t) => [W.fmtIso(t.ts), t.type === 'in' ? 'รับเข้า' : 'จ่ายออก', t.lot, t.doNo || '', t.color, t.qty, t.loc, t.note || '', t.by || ''].map(q).join(','));
    // BOM ให้ Excel อ่านภาษาไทยถูก
    const blob = new Blob(['﻿' + [head.map(q).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const d = new Date(), name = `wms-history-${filter}-${d.getFullYear()}${W.pad2(d.getMonth() + 1)}${W.pad2(d.getDate())}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    W.toast(`ส่งออก ${list.length} รายการ`, 'ok');
  }

  return {
    title: 'ประวัติ',
    mount(container) {
      el = container;
      el.addEventListener('click', (e) => {
        const f = e.target.closest('[data-f]');
        if (f) { filter = f.dataset.f; render(W.db.state); }
        else if (e.target.closest('[data-act="csv"]')) exportCsv();
      });
    },
    update: render
  };
})(window.WMS);
