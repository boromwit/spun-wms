// หน้า 2: บันทึกรับเข้า — รูป, lot, หลายสี, จำนวน, ตำแหน่งแนะนำตาม ABC (เปลี่ยนได้)
window.WMS = window.WMS || {};
WMS.pages = WMS.pages || {};
WMS.pages.receive = (function (W) {
  let el, rows = [], nextId = 1, state = W.db.state;

  const newRow = () => ({ id: nextId++, color: '', qty: '', photo: null, loc: null, manual: false, pickerOpen: false, pickerZone: WMS_CONFIG.zones[0].id, node: null });

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

  const othersLocs = (row) => new Set(rows.filter((r) => r !== row && r.loc).map((r) => r.loc));

  function optHtml(row, l, badge) {
    return `<label class="opt ${row.loc === l.code ? 'sel' : ''}">
      <input type="radio" name="loc-${row.id}" value="${l.code}" ${row.loc === l.code ? 'checked' : ''}>
      <span class="opt-main"><span class="opt-code">${l.code}</span><span class="opt-meta">${W.h(W.locLabel(l.code))}</span></span>
      ${badge ? '<span class="badge">แนะนำ</span>' : '<span class="badge ghost">เลือกเอง</span>'}
    </label>`;
  }

  function renderLoc(row) {
    const box = row.node.querySelector('.loc-box');
    const cl = W.abc.classOf(row.color, state);
    const others = othersLocs(row);
    if (row.loc && state.slots[row.loc]) { row.loc = null; row.manual = false; } // มีคนใช้ช่องนี้ไปแล้ว
    const recs = W.abc.suggest(cl.cls, state, others, 3);
    if (!row.manual && (!row.loc || !recs.some((r) => r.code === row.loc))) row.loc = recs[0] ? recs[0].code : null;

    let list = recs.map((l) => optHtml(row, l, true)).join('');
    if (row.loc && !recs.some((r) => r.code === row.loc)) list += optHtml(row, W.locMap[row.loc], false);
    if (!list) list = '<p class="empty">ไม่มีช่องว่างเหลือ</p>';

    let picker = '';
    if (row.pickerOpen) {
      const free = W.abc.ranked(cl.cls, state, others);
      const zones = WMS_CONFIG.zones;
      const inZone = free.filter((l) => l.zone === row.pickerZone).sort((a, b) => a.order - b.order);
      picker = `<div class="picker">
        <div class="chips">${zones.map((z) => `<button type="button" class="chip-btn ${z.id === row.pickerZone ? 'on' : ''}" data-zone="${z.id}">${W.h(z.name)} <small>(${free.filter((l) => l.zone === z.id).length} ว่าง)</small></button>`).join('')}</div>
        <div class="picker-grid">${inZone.map((l) => `<button type="button" class="slot-btn" data-loc="${l.code}">${l.code}</button>`).join('') || '<p class="empty">โซนนี้เต็ม</p>'}</div>
      </div>`;
    }
    box.innerHTML = `<div class="loc-title">ตำแหน่งจัดเก็บ
        <span class="abc-pill c${cl.cls}">Class ${cl.cls}</span></div>
      <p class="loc-why">${W.h(W.abc.reasonText(cl.reason))}</p>
      <div class="opts" role="radiogroup">${list}</div>
      <button type="button" class="btn link" data-act="picker">${row.pickerOpen ? 'ซ่อนตัวเลือกอื่น' : 'เลือกตำแหน่งอื่น…'}</button>${picker}`;
  }

  const refreshLocs = () => rows.forEach(renderLoc);

  function rowNode(row, idx) {
    const n = document.createElement('section');
    n.className = 'card row';
    n.innerHTML = `<div class="row-head"><b class="row-title"></b>
        <button type="button" class="icon-btn rm" aria-label="ลบสีนี้">${W.icon.trash}</button></div>
      <div class="grid2">
        <label class="field">สี<input class="in color" list="color-list" placeholder="เช่น ดำ, น้ำเงิน" autocomplete="off"></label>
        <label class="field">จำนวน (${W.unit})<input class="in qty" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label>
      </div>
      <div class="photo-row">
        <label class="btn ghost photo-btn">${W.icon.camera}<span>ถ่ายรูปม้วนผ้า</span>
          <input class="photo-in" type="file" accept="image/*" capture="environment" hidden></label>
        <div class="thumb-wrap" hidden><img class="thumb" alt="รูปม้วนผ้า"><button type="button" class="thumb-x" aria-label="ลบรูป">×</button></div>
      </div>
      <div class="loc-box"></div>`;
    row.node = n;
    const color = n.querySelector('.color'), qty = n.querySelector('.qty');
    color.value = row.color; qty.value = row.qty;
    let t;
    color.addEventListener('input', () => { row.color = color.value; clearTimeout(t); t = setTimeout(() => renderLoc(row), 250); refreshTitles(); });
    color.addEventListener('change', () => { row.color = color.value; refreshLocs(); });
    qty.addEventListener('input', () => { row.qty = qty.value; });
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
    n.querySelector('.loc-box').addEventListener('change', (e) => {
      if (e.target.name === 'loc-' + row.id) { row.loc = e.target.value; row.manual = true; refreshLocs(); }
    });
    n.querySelector('.loc-box').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'picker') { row.pickerOpen = !row.pickerOpen; renderLoc(row); }
      else if (b.dataset.zone) { row.pickerZone = b.dataset.zone; renderLoc(row); }
      else if (b.dataset.loc) { row.loc = b.dataset.loc; row.manual = true; row.pickerOpen = false; refreshLocs(); }
    });
    showPhoto();
    return n;
  }

  function refreshTitles() {
    rows.forEach((r, i) => {
      r.node.querySelector('.row-title').textContent = `สีที่ ${i + 1}` + (r.color.trim() ? ` — ${r.color.trim()}` : '');
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
    const L = WMS_CONFIG.lot, m0 = new Date().getMonth();
    el.innerHTML = `<section class="card">
        <div class="field-title">รหัส lot <em>*</em></div>
        <div class="lot-parts">
          <label class="field">ล็อก
            <select id="lot-p" class="in"><option value="">เลือก</option>${L.prefixes.map((p) => `<option value="${p.v}">${W.h(p.label)}</option>`).join('')}</select></label>
          <label class="field">เดือน
            <select id="lot-m" class="in">${L.months.map((m, i) => `<option value="${W.h(m)}" ${i === m0 ? 'selected' : ''}>${W.h(m)} (${L.monthNames[i]})</option>`).join('')}</select></label>
          <label class="field">ประเภท
            <select id="lot-t" class="in"><option value="">เลือก</option>${L.types.map((t) => `<option value="${t.v}">${W.h(t.label)}</option>`).join('')}</select></label>
          <label class="field">เลขรัน (${L.runDigits} หลัก)
            <input id="lot-r" class="in" inputmode="numeric" maxlength="${L.runDigits}" autocomplete="off" placeholder="${'0'.repeat(L.runDigits - 1)}1"></label>
        </div>
        <div class="lot-preview" id="lot-preview" aria-live="polite"></div>
        <label class="field" style="margin-top:12px">D/O <small>(ถ้ามี)</small><input id="do" class="in" autocapitalize="characters" autocomplete="off" placeholder="เช่น DO-5503"></label>
      </section>
      <datalist id="color-list"></datalist>
      <div id="rows"></div>
      <button type="button" id="add" class="btn ghost block">${W.icon.plus} เพิ่มสี</button>
      <button type="button" id="save" class="btn primary block big">บันทึกรับเข้า</button>`;
    const run = el.querySelector('#lot-r');
    run.addEventListener('input', () => { run.value = run.value.replace(/\D/g, ''); updateLotPreview(); });
    run.addEventListener('blur', () => { if (run.value) run.value = run.value.padStart(L.runDigits, '0'); updateLotPreview(); });
    ['#lot-p', '#lot-m', '#lot-t'].forEach((s) => el.querySelector(s).addEventListener('change', updateLotPreview));
    updateLotPreview();
    el.querySelector('#add').addEventListener('click', addRow);
    el.querySelector('#save').addEventListener('click', save);
    updateColorList();
    addRow();
  }

  // ประกอบรหัส lot จาก 4 ส่วน → null ถ้ากรอกไม่ครบ  เช่น B-9SR01
  function lotParts() {
    const g = (s) => el.querySelector(s).value;
    return { p: g('#lot-p'), m: g('#lot-m'), t: g('#lot-t'), r: g('#lot-r').padStart(WMS_CONFIG.lot.runDigits, '0') };
  }
  function buildLot() {
    const { p, m, t } = lotParts(), raw = el.querySelector('#lot-r').value;
    return p && m && t && raw ? `${p}-${m}${t}${lotParts().r}` : null;
  }
  function updateLotPreview() {
    const code = buildLot(), box = el.querySelector('#lot-preview');
    box.innerHTML = code ? `รหัส lot: <b>${W.h(code)}</b>` : '<span class="muted">เลือกให้ครบทุกช่องเพื่อสร้างรหัส lot</span>';
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
      const miss = [['#lot-p', 'ล็อก (B/L)'], ['#lot-t', 'ประเภท'], ['#lot-r', 'เลขรัน']].find(([s]) => !el.querySelector(s).value);
      W.toast('รหัส lot ไม่ครบ: กรุณาเลือก/กรอก ' + (miss ? miss[1] : ''), 'error');
      if (miss) el.querySelector(miss[0]).focus();
      return;
    }
    const entries = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], qty = parseFloat(r.qty);
      if (!r.color.trim()) { W.toast(`สีที่ ${i + 1}: กรุณากรอกสี`, 'error'); r.node.querySelector('.color').focus(); return; }
      if (!(qty > 0)) { W.toast(`สีที่ ${i + 1}: กรุณากรอกจำนวน`, 'error'); r.node.querySelector('.qty').focus(); return; }
      if (!r.loc) { W.toast(`สีที่ ${i + 1}: กรุณาเลือกตำแหน่ง`, 'error'); return; }
      entries.push({ color: r.color.trim(), qty, loc: r.loc, photo: r.photo });
    }
    const btn = el.querySelector('#save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      await W.db.receive({ lot, doNo, entries });
      W.sheet({
        title: 'บันทึกรับเข้าแล้ว', sub: `Lot ${lot}` + (doNo ? ` · D/O ${doNo}` : ''),
        body: '<p class="sheet-sub">นำไปวางที่ตำแหน่งต่อไปนี้</p><div class="put-list">' +
          entries.map((e) => `<div class="put"><span class="put-loc">${e.loc}</span><span>${W.h(e.color)} · ${W.fmtQty(e.qty)} ${W.unit}</span></div>`).join('') + '</div>',
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
