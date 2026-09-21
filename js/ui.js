// Utilities + UI primitives (sheet, toast, icons) + ผังตำแหน่งจาก config
window.WMS = window.WMS || {};
(function (W) {
  const C = WMS_CONFIG;

  W.h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  W.pad2 = (n) => String(n).padStart(2, '0');
  W.unit = C.unit;
  W.fmtQty = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  W.fmtTime = (ts) => new Date(ts).toLocaleString('th-TH',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  W.fmtIso = (ts) => {
    const d = new Date(ts), p = W.pad2;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  // ---------- ผังตำแหน่ง ----------
  W.locs = [];
  W.locMap = {};
  C.zones.forEach((z, zi) => {
    z.rows.forEach((row) => {
      for (let bay = 1; bay <= row.bays; bay++) {
        C.levelPref.forEach((l, li) => {
          const code = `${row.id}-${W.pad2(bay)}-${l}`;
          const o = {
            code, zone: z.id, row: row.id, bay, level: l, abc: row.abc,
            order: C.doorOrder.indexOf(row.id) * 10000 + bay * 10 + li
          };
          W.locs.push(o);
          W.locMap[code] = o;
        });
      }
    });
  });
  W.levels = C.levelPref.slice().sort((a, b) => b - a); // บนสุดก่อน
  W.locLabel = (code) => {
    const l = W.locMap[code];
    return l ? `ชั้นวาง ${l.row} · ช่อง ${W.pad2(l.bay)} · ชั้น ${l.level}` : code;
  };

  // ---------- ไอคอน ----------
  const svg = (p) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  W.icon = {
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    receive: svg('<path d="M21 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 3h22v5H1z"/><path d="M12 11v6m-3-3 3 3 3-3"/>'),
    map: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
    camera: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
    arrowIn: svg('<path d="M12 5v14m-6-6 6 6 6-6"/>'),
    arrowOut: svg('<path d="M12 19V5m-6 6 6-6 6 6"/>')
  };

  // ---------- Toast ----------
  W.toast = (msg, kind = 'info') => {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2800);
  };

  W.errMsg = (e) => {
    const m = String((e && e.message) || e);
    if (m.startsWith('SLOT_TAKEN')) return 'ช่อง ' + (m.split(':')[1] || '') + ' มีคนใช้ไปแล้ว กรุณาเลือกตำแหน่งใหม่';
    if (m.includes('ALREADY_PICKED')) return 'รายการนี้ถูกหยิบไปแล้ว';
    if (m.includes('NOT_FOUND')) return 'ไม่พบรายการ';
    if (/offline|unavailable|network/i.test(m)) return 'ไม่มีอินเทอร์เน็ต — ต้องออนไลน์เพื่อบันทึก';
    return 'เกิดข้อผิดพลาด: ' + m;
  };

  // ---------- Bottom sheet ----------
  // opts: {title, sub, body(html|Node), actions:[{label, kind, onClick}]}
  W.sheet = (opts) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-bg"></div>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="grab"></div>
        <h3>${W.h(opts.title || '')}</h3>
        ${opts.sub ? `<p class="sheet-sub">${W.h(opts.sub)}</p>` : ''}
        <div class="sheet-body"></div>
        <div class="sheet-actions"></div>
      </div>`;
    const body = wrap.querySelector('.sheet-body');
    if (opts.body instanceof Node) body.appendChild(opts.body); else body.innerHTML = opts.body || '';
    const close = () => {
      wrap.classList.add('out');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 200);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.querySelector('.sheet-bg').addEventListener('click', close);
    const actions = wrap.querySelector('.sheet-actions');
    (opts.actions || [{ label: 'ปิด', kind: 'ghost' }]).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || 'ghost');
      b.textContent = a.label;
      b.addEventListener('click', async () => {
        if (!a.onClick) return close();
        b.disabled = true;
        try {
          const r = await a.onClick();
          if (r !== false) close(); else b.disabled = false;
        } catch (e) { W.toast(W.errMsg(e), 'error'); b.disabled = false; }
      });
      actions.appendChild(b);
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return { close, el: wrap };
  };

  W.kv = (rows) => '<dl class="kv">' + rows.filter(Boolean).map(
    ([k, v]) => `<dt>${W.h(k)}</dt><dd>${v}</dd>`).join('') + '</dl>';
})(window.WMS);
