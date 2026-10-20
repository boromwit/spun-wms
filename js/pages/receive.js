// หน้า 2: บันทึกรับเข้า — รูป, lot, หลายสี, จำนวนพาเรท (1 พาเรท = 1 ช่อง), ตำแหน่งแนะนำตาม ABC (เปลี่ยนได้)
window.WMS = window.WMS || {};
WMS.pages = WMS.pages || {};
WMS.pages.receive = (function (W) {
  let el, rows = [], nextId = 1, state = W.db.state;
  const MAXP = WMS_CONFIG.maxPallets || 30;
  const MAX_LOT = 39; // กฎ Firestore: รหัส lot ต้องยาวไม่เกิน 39 ตัวอักษร (ช่องเลขรัน/เลขที่พิมพ์ได้ไม่จำกัด แต่รหัสรวมต้องไม่เกินนี้)

  const newRow = () => ({
    id: nextId++, color: '', qty: '', photo: null, cls: null, node: null,
    slots: [{ loc: null, manual: false }],   // 1 พาเรท = 1 ช่อง
    pickerIdx: -1, pickerZone: WMS_CONFIG.zones[0].id
  });

  // ลดรูปให้เล็กพอเก็บใน Firestore doc (จำกัด 1MB) ~50-100KB
  function compress(file, max = 900, q = 0.6) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านรูปไม่ได้')); };
      img.src = url;
    });
  }

  // ข้อมูลที่ใช้หา "ชนิดของผ้า" สำหรับ ABC: ล็อก/ขนาด/ผ้าพับ-ม้วน ของทั้ง lot + สีของแถวนี้
  const abcCtx = (r) => ({ lock: val('#lot-p'), size: val('#lot-s'), form: val('#lot-f'), color: r.color });

  // จัดช่องให้ทุกพาเรทของทุกสี: ช่องที่พนักงานเลือกเองจองไว้ก่อน ที่เหลือใช้ช่องแนะนำตาม ABC เรียงลำดับ ไม่ซ้ำกัน
  function assignLocs() {
    const used = new Set();
    rows.forEach((r) => r.slots.forEach((s) => {
      if (!s.manual) return;
      if (s.loc && !state.slots[s.loc] && !used.has(s.loc)) used.add(s.loc);
      else { s.manual = false; s.loc = null; } // ช่องถูกใช้ไปแล้ว/ซ้ำ → กลับไปใช้ค่าแนะนำ
    }));
    rows.forEach((r) => {
      r.cls = W.abc.classOf(abcCtx(r));
      const ranked = W.abc.ranked(r.cls.cls, state, used);
      let k = 0;
      r.slots.forEach((s) => {
        if (s.manual) return;
        const l = ranked[k++];
        s.loc = l ? l.code : null;
        if (l) used.add(l.code);
      });
    });
  }

  function pickerHtml(row, i) {
    const taken = new Set();
    rows.forEach((r) => r.slots.forEach((s, j) => { if (s.loc && !(r === row && j === i)) taken.add(s.loc); }));
    const free = W.abc.ranked(row.cls.cls, state, taken);
    const inZone = free.filter((l) => l.zone === row.pickerZone).sort((a, b) => a.order - b.order);
    const btn = (l) => `<button type="button" class="slot-btn" data-loc="${l.code}">${l.code}</button>`;
    return `<div class="picker">
      <div class="picker-quick"><span class="muted">แนะนำ</span>${free.slice(0, 3).map(btn).join('')}
        <button type="button" class="btn link" data-act="auto">ใช้ค่าแนะนำ</button></div>
      <div class="chips">${WMS_CONFIG.zones.map((z) => `<button type="button" class="chip-btn ${z.id === row.pickerZone ? 'on' : ''}" data-zone="${z.id}">${W.h(z.name)} <small>(${free.filter((l) => l.zone === z.id).length} ว่าง)</small></button>`).join('')}</div>
      <div class="picker-grid">${inZone.map(btn).join('') || '<p class="empty">โซนนี้เต็ม</p>'}</div>
    </div>`;
  }

  function renderLoc(row) {
    const box = row.node.querySelector('.loc-box');
    const cl = row.cls || W.abc.classOf(abcCtx(row)), need = row.slots.length;
    const missing = row.slots.filter((s) => !s.loc).length;
    const items = row.slots.map((s, i) => {
      const l = s.loc && W.locMap[s.loc];
      return `<div class="pal ${l ? '' : 'bad'}">
        <div class="pal-n">พาเรท ${i + 1}${need > 1 ? '/' + need : ''}</div>
        <div class="pal-main">${l
          ? `<span class="opt-code">${l.code}</span><span class="opt-meta">${W.h(W.locLabel(l.code))}</span>`
          : '<span class="opt-meta">ไม่มีช่องว่าง</span>'}</div>
        <span class="badge ${s.manual ? 'ghost' : ''}">${s.manual ? 'เลือกเอง' : 'แนะนำ'}</span>
        <button type="button" class="btn sm ghost" data-act="pick" data-i="${i}">${row.pickerIdx === i ? 'ปิด' : 'เปลี่ยน'}</button>
      </div>${row.pickerIdx === i && row.cls ? pickerHtml(row, i) : ''}`;
    }).join('');
    box.innerHTML = `<div class="loc-title">ตำแหน่งจัดเก็บ <small class="muted">(ใช้ ${need} ช่อง)</small>
        <span class="abc-pill c${cl.cls}">Class ${cl.cls}</span></div>
      <p class="loc-why">${W.h(cl.text)}</p>
      ${missing ? `<p class="warn">ช่องว่างไม่พอ — ขาดอีก ${missing} ช่อง</p>` : ''}
      <div class="pals">${items}</div>`;
  }

  function updateNeed() {
    const box = el.querySelector('#need');
    if (!box) return;
    const total = rows.reduce((a, r) => a + r.slots.length, 0);
    const free = W.locs.filter((l) => !state.slots[l.code]).length;
    box.textContent = `รวมต้องใช้ ${total} ช่อง · ว่างทั้งคลัง ${free} ช่อง`;
  }

  const refreshLocs = () => { assignLocs(); rows.forEach(renderLoc); updateNeed(); };

  function setPallets(row, n) {
    while (row.slots.length < n) row.slots.push({ loc: null, manual: false });
    while (row.slots.length > n) row.slots.pop();
    if (row.pickerIdx >= n) row.pickerIdx = -1;
    refreshTitles(); refreshLocs();
  }

  function rowNode(row) {
    const n = document.createElement('section');
    n.className = 'card row';
    n.innerHTML = `<div class="row-head"><b class="row-title"></b>
        <button type="button" class="icon-btn rm" aria-label="ลบสีนี้">${W.icon.trash}</button></div>
      <div class="grid2">
        <label class="field">สี<input class="in color" list="color-list" placeholder="เช่น ดำ, น้ำเงิน" autocomplete="off"></label>
        <label class="field">จำนวนพาเรท<input class="in pallets" type="number" inputmode="numeric" min="1" max="${MAXP}" step="1" value="1"></label>
      </div>
      <label class="field" style="margin-top:10px">จำนวน (${W.unit}) <small>— ดูข้อมูลอย่างเดียว ไม่ใช้คำนวณช่อง</small>
        <input class="in qty" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label>
      <div class="photo-row">
        <label class="btn ghost photo-btn">${W.icon.camera}<span>ถ่ายรูปม้วนผ้า</span>
          <input class="photo-in" type="file" accept="image/*" capture="environment" hidden></label>
        <div class="thumb-wrap" hidden><img class="thumb" alt="รูปม้วนผ้า"><button type="button" class="thumb-x" aria-label="ลบรูป">×</button></div>
      </div>
      <div class="loc-box"></div>`;
    row.node = n;
    const color = n.querySelector('.color'), qty = n.querySelector('.qty'), pal = n.querySelector('.pallets');
    color.value = row.color; qty.value = row.qty;
    let t;
    color.addEventListener('input', () => { row.color = color.value; clearTimeout(t); t = setTimeout(refreshLocs, 250); refreshTitles(); });
    color.addEventListener('change', () => { row.color = color.value; refreshLocs(); });
    qty.addEventListener('input', () => { row.qty = qty.value; });
    pal.addEventListener('input', () => {
      const v = parseInt(pal.value, 10);
      if (v >= 1) setPallets(row, Math.min(v, MAXP));
    });
    pal.addEventListener('change', () => { pal.value = row.slots.length; });
    const wrap = n.querySelector('.thumb-wrap'), thumb = n.querySelector('.thumb');
    const showPhoto = () => { wrap.hidden = !row.photo; if (row.photo) thumb.src = row.photo; };
    n.querySelector('.photo-in').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { row.photo = await compress(f); showPhoto(); } catch (err) { W.toast(W.errMsg(err), 'error'); }
      e.target.value = '';
    });
    n.querySelector('.thumb-x').addEventListener('click', () => { row.photo = null; showPhoto(); });
    n.querySelector('.rm').addEventListener('click', () => {
      if (rows.length === 1) return W.toast('ต้องมีอย่างน้อย 1 สี');
      rows = rows.filter((r) => r !== row);
      n.remove(); refreshTitles(); refreshLocs();
    });
    n.querySelector('.loc-box').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const slot = row.slots[row.pickerIdx];
      if (b.dataset.act === 'pick') { const i = +b.dataset.i; row.pickerIdx = row.pickerIdx === i ? -1 : i; renderLoc(row); }
      else if (b.dataset.act === 'auto') { if (slot) slot.manual = false; row.pickerIdx = -1; refreshLocs(); }
      else if (b.dataset.zone) { row.pickerZone = b.dataset.zone; renderLoc(row); }
      else if (b.dataset.loc) { if (slot) { slot.loc = b.dataset.loc; slot.manual = true; } row.pickerIdx = -1; refreshLocs(); }
    });
    showPhoto();
    return n;
  }

  function refreshTitles() {
    rows.forEach((r, i) => {
      const n = r.slots.length;
      r.node.querySelector('.row-title').textContent = `สีที่ ${i + 1}` + (r.color.trim() ? ` — ${r.color.trim()}` : '') + (n > 1 ? ` · ${n} พาเรท` : '');
      r.node.querySelector('.rm').style.visibility = rows.length > 1 ? 'visible' : 'hidden';
    });
  }

  function addRow() {
    const r = newRow();
    rows.push(r);
    el.querySelector('#rows').appendChild(rowNode(r));
    refreshTitles(); refreshLocs();
    return r;
  }

  function build() {
    rows = [];
    const L = WMS_CONFIG.lot, F = WMS_CONFIG.fabric, m0 = new Date().getMonth();
    el.innerHTML = `<section class="card">
        <div class="field-title">รหัส lot <em>*</em></div>
        <div class="lot-parts">
          <label class="field">ล็อก
            <select id="lot-p" class="in"><option value="">เลือก</option>${L.prefixes.map((p) => `<option value="${p.v}">${W.h(p.label)}</option>`).join('')}</select></label>
          <label class="field" id="lot-m-wrap">เดือน
            <select id="lot-m" class="in">${L.months.map((m, i) => `<option value="${W.h(m)}" ${i === m0 ? 'selected' : ''}>${W.h(m)} (${L.monthNames[i]})</option>`).join('')}</select></label>
          <label class="field" id="lot-t-wrap">ประเภท <small>(ตามล็อก)</small>
            <select id="lot-t" class="in" disabled><option value="">เลือกล็อกก่อน</option>${L.types.map((t) => `<option value="${t.v}">${W.h(t.label)}</option>`).join('')}</select></label>
          <label class="field" id="lot-r-wrap">เลขรัน <small>(ตัวเลข/ตัวอักษร ไม่จำกัด)</small>
            <input id="lot-r" class="in" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="${'0'.repeat(L.runDigits - 1)}1 หรือ A1"></label>
          <label class="field" id="lot-n-wrap" hidden>เลขที่ <small>(พิมพ์เอง ตัวเลข/ตัวอักษร ไม่จำกัด)</small>
            <input id="lot-n" class="in" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="เช่น 4821 หรือ A12"></label>
          <label class="field" id="lot-s-wrap">ขนาดผ้า <small>(ไม่อยู่ในรหัส)</small>
            <select id="lot-s" class="in"><option value="">เลือก</option>${F.sizes.map((x) => `<option value="${x.v}">${W.h(x.label)}</option>`).join('')}</select></label>
          <label class="field" id="lot-f-wrap" hidden>ผ้าพับ/ผ้าม้วน <small>(ไม่อยู่ในรหัส)</small>
            <select id="lot-f" class="in"><option value="">เลือก</option>${F.forms.map((x) => `<option value="${x.v}">${W.h(x.label)}</option>`).join('')}</select></label>
        </div>
        <div class="lot-preview" id="lot-preview" aria-live="polite"></div>
        <label class="field" style="margin-top:12px">D/O <small>(ถ้ามี)</small><input id="do" class="in" autocapitalize="characters" autocomplete="off" placeholder="เช่น DO-5503"></label>
      </section>
      <datalist id="color-list"></datalist>
      <div id="rows"></div>
      <button type="button" id="add" class="btn ghost block">${W.icon.plus} เพิ่มสี</button>
      <p id="need" class="need" aria-live="polite"></p>
      <button type="button" id="save" class="btn primary block big">บันทึกรับเข้า</button>`;
    const run = el.querySelector('#lot-r');
    run.addEventListener('input', () => { run.value = run.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); updateLotPreview(); });
    run.addEventListener('blur', () => { run.value = padRun(run.value); updateLotPreview(); });
    const num = el.querySelector('#lot-n');
    num.addEventListener('input', () => { num.value = num.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); updateLotPreview(); });
    el.querySelector('#lot-p').addEventListener('change', syncLot);
    el.querySelector('#lot-m').addEventListener('change', updateLotPreview);
    ['#lot-s', '#lot-f'].forEach((s) => el.querySelector(s).addEventListener('change', refreshLocs)); // ขนาด/ผ้าพับ-ม้วน เปลี่ยน → class เปลี่ยน → จัดช่องใหม่
    syncLot();
    el.querySelector('#add').addEventListener('click', addRow);
    el.querySelector('#save').addEventListener('click', save);
    updateColorList();
    addRow();
  }

  // ประกอบรหัส lot → null ถ้ากรอกไม่ครบ   B: B-9SR01 · L: L-3LD12 · 3G: 3G-4821
  const val = (s) => el.querySelector(s).value;
  // เลขรัน: ตัวเลขล้วนเติม 0 ข้างหน้าให้ครบหลัก (1 → 01) ถ้ามีตัวอักษรใช้ตามที่พิมพ์ (A1, 1A)
  const padRun = (v) => (/^\d+$/.test(v) ? v.padStart(WMS_CONFIG.lot.runDigits, '0') : v);
  const lotPrefix = () => WMS_CONFIG.lot.prefixes.find((x) => x.v === val('#lot-p'));
  function buildLot() {
    const P = lotPrefix();
    if (!P) return null;
    if (P.manual) { const n = val('#lot-n'); return n ? `${P.v}-${n}` : null; }
    const run = val('#lot-r');
    if (!val('#lot-m') || !run) return null;
    return `${P.v}-${val('#lot-m')}${P.type}${padRun(run)}`;
  }
  // เลือกล็อกแล้วปรับฟอร์ม: 3G → ซ่อนเดือน/ประเภท/เลขรัน แสดงเลขที่ · B/L → ตั้งประเภทตามล็อก (แก้ไม่ได้)
  function syncLot() {
    const P = lotPrefix(), manual = !!(P && P.manual);
    ['#lot-m-wrap', '#lot-t-wrap', '#lot-r-wrap'].forEach((s) => { el.querySelector(s).hidden = manual; });
    el.querySelector('#lot-n-wrap').hidden = !manual;
    el.querySelector('#lot-f-wrap').hidden = !manual;     // ผ้าพับ/ผ้าม้วน เลือกเฉพาะล็อก 3G
    if (!manual) el.querySelector('#lot-f').value = '';
    el.querySelector('#lot-t').value = P && P.type ? P.type : '';
    updateLotPreview();
    refreshLocs();   // ล็อกเปลี่ยน → ชนิดผ้า/class เปลี่ยน → จัดช่องใหม่
  }
  function updateLotPreview() {
    const code = buildLot(), box = el.querySelector('#lot-preview');
    box.innerHTML = code
      ? `รหัส lot: <b>${W.h(code)}</b>` + (code.length > MAX_LOT ? `<p class="warn">รหัสยาว ${code.length} ตัวอักษร เกินที่ระบบเก็บได้ (สูงสุด ${MAX_LOT}) — ตัดให้สั้นลง</p>` : '')
      : '<span class="muted">เลือกให้ครบทุกช่องเพื่อสร้างรหัส lot</span>';
  }

  function updateColorList() {
    const dl = el.querySelector('#color-list');
    if (!dl) return;
    const set = [...new Set(state.stock.map((s) => s.color))].sort();
    dl.innerHTML = set.map((c) => `<option value="${W.h(c)}">`).join('');
  }

  async function save() {
    const lot = buildLot();
    const doNo = el.querySelector('#do').value.trim().toUpperCase();
    if (!lot) {
      const P = lotPrefix();
      const miss = [['#lot-p', 'ล็อก'], P && P.manual ? ['#lot-n', 'เลขที่ 3G'] : ['#lot-r', 'เลขรัน']]
        .find(([s]) => !val(s));
      W.toast('รหัส lot ไม่ครบ: กรุณาเลือก/กรอก ' + (miss ? miss[1] : ''), 'error');
      if (miss) el.querySelector(miss[0]).focus();
      return;
    }
    if (lot.length > MAX_LOT) { W.toast(`รหัส lot ยาวเกินไป (${lot.length} ตัวอักษร สูงสุด ${MAX_LOT})`, 'error'); return; }
    const size = val('#lot-s'), LP = lotPrefix(), form = LP && LP.manual ? val('#lot-f') : '';
    if (!size) { W.toast('กรุณาเลือกขนาดผ้า', 'error'); el.querySelector('#lot-s').focus(); return; }
    if (LP && LP.manual && !form) { W.toast('กรุณาเลือกผ้าพับหรือผ้าม้วน', 'error'); el.querySelector('#lot-f').focus(); return; }
    assignLocs();
    const entries = [], seen = new Set();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], qty = parseFloat(r.qty), n = r.slots.length;
      if (!r.color.trim()) { W.toast(`สีที่ ${i + 1}: กรุณากรอกสี`, 'error'); r.node.querySelector('.color').focus(); return; }
      if (!(qty > 0)) { W.toast(`สีที่ ${i + 1}: กรุณากรอกจำนวน`, 'error'); r.node.querySelector('.qty').focus(); return; }
      if (r.slots.some((s) => !s.loc || seen.has(s.loc))) { W.toast(`สีที่ ${i + 1}: ช่องว่างไม่พอสำหรับ ${n} พาเรท`, 'error'); refreshLocs(); return; }
      // 1 พาเรท = 1 ช่อง = 1 รายการ (จำนวนม้วนเก็บไว้ดูอย่างเดียว) รูปเก็บที่พาเรทแรกพาเรทเดียว
      const entryId = 'e' + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 6);
      r.slots.forEach((s, k) => {
        seen.add(s.loc);
        entries.push({ color: r.color.trim(), qty, loc: s.loc, photo: k === 0 ? r.photo : null, entryId, pallet: k + 1, pallets: n, size, ...(form ? { form } : {}) });
      });
    }
    const btn = el.querySelector('#save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      await W.db.receive({ lot, doNo, entries });
      W.sheet({
        title: 'บันทึกรับเข้าแล้ว', sub: `Lot ${lot}` + (doNo ? ` · D/O ${doNo}` : '') + ` · ${entries.length} พาเรท`,
        body: '<p class="sheet-sub">นำแต่ละพาเรทไปวางที่ตำแหน่งต่อไปนี้</p><div class="put-list">' +
          entries.map((e) => `<div class="put"><span class="put-loc">${e.loc}</span><span>${W.h(e.color)} · ${e.pallets > 1 ? `พาเรท ${e.pallet}/${e.pallets}` : `${W.fmtQty(e.qty)} ${W.unit}`}</span></div>`).join('') + '</div>',
        actions: [{ label: 'เรียบร้อย', kind: 'primary' }]
      });
      build();
      window.scrollTo(0, 0);
    } catch (e) {
      W.toast(W.errMsg(e), 'error');
      btn.disabled = false; btn.textContent = 'บันทึกรับเข้า';
      refreshLocs();
    }
  }

  return {
    title: 'บันทึกรับเข้า',
    mount(container) { el = container; state = W.db.state; build(); },
    update(s) { state = s; if (el && el.querySelector('#rows')) { updateColorList(); refreshLocs(); } }
  };
})(window.WMS);
