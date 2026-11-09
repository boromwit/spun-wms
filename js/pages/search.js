// หน้า 1: ค้นหา D/O หรือ lot → การ์ด + แท็กตำแหน่ง (เหลือง = ยังไม่หยิบ, เขียว = หยิบแล้ว)
window.WMS = window.WMS || {};
WMS.pages = WMS.pages || {};
WMS.pages.search = (function (W) {
  let el, input, results, query = '';

  const norm = (s) => String(s || '').trim().toUpperCase();

  function groupLots(state, q) {
    const byLot = {};
    state.stock.forEach((s) => { (byLot[s.lot] = byLot[s.lot] || []).push(s); });
    let lots = Object.keys(byLot);
    if (q) lots = lots.filter((l) => l.includes(q) || byLot[l].some((s) => (s.doNo || '').includes(q) || (s.customer || '').toUpperCase().includes(q)));
    const latest = (l) => Math.max(...byLot[l].map((s) => s.receivedAt || 0));
    lots.sort((a, b) => latest(b) - latest(a));
    return { lots, byLot };
  }

  function tagHtml(s) {
    const picked = s.status === 'picked';
    const age = s.receivedAt && (!picked || s.pickedAt)
      ? `<span class="tag-age">${picked ? 'เก็บอยู่' : 'เก็บมา'} ${W.ageHtml(s.receivedAt, picked ? s.pickedAt : null)}</span>` : '';
    return `<button class="tag ${picked ? 'picked' : 'pending'}" data-id="${W.h(s.id)}"
        aria-label="${W.h(s.loc)} ${picked ? 'หยิบแล้ว' : 'ยังไม่หยิบ'}">
      <span class="tag-loc">${W.h(s.loc)}</span>
      <span class="tag-sub">${W.h(s.color)} · ${W.palletLabel(s) || W.fmtQty(s.qty)}</span>
      <span class="tag-state">${picked ? W.icon.check + ' หยิบแล้ว' : 'ยังไม่หยิบ'}</span>${age}
    </button>`;
  }

  function cardHtml(lot, items) {
    const dos = [...new Set(items.map((s) => s.doNo).filter(Boolean))];
    const stored = items.filter((s) => s.status === 'stored');
    const pickedN = items.length - stored.length;
    const custNames = [...new Set(items.map((s) => s.customer).filter(Boolean))];
    const custLine = custNames.length ? `<div class="lot-cust"><small>ลูกค้า</small><b>${custNames.map((c) => W.h(c)).join(' / ')}</b></div>` : '';
    const oldest = Math.min(...stored.map((s) => s.receivedAt || Infinity));
    const age = stored.length && isFinite(oldest) ? `<span class="chip">${stored.length > 1 ? 'เก็บมานานสุด' : 'เก็บมา'} ${W.ageHtml(oldest)}</span>` : '';
    const m = items.find((s) => s.size || s.form) || {};
    const tags = [m.size && W.sizeLabel(m.size), m.form && W.formLabel(m.form)].filter(Boolean).map((t) => `<span class="chip">${W.h(t)}</span>`).join('');
    items = items.slice().sort((a, b) => (a.status === 'picked') - (b.status === 'picked') || a.loc.localeCompare(b.loc));
    return `<article class="card lot-card">
      <div class="lot-head">
        <div><div class="lot-code">${W.h(lot)}</div>${custLine}
          <div class="lot-do">${dos.length ? dos.map((d) => `<span class="chip">D/O ${W.h(d)}</span>`).join('') : '<span class="muted">ไม่มี D/O</span>'}${tags}${age}</div></div>
        <div class="lot-sum"><b>${stored.length}</b><span>พาเรท คงเหลือ</span></div>
      </div>
      <div class="lot-progress">หยิบแล้ว ${pickedN}/${items.length} พาเรท
        ${pickedN ? `<button class="btn danger sm" data-clear="${W.h(lot)}">ลบที่หยิบแล้ว (${pickedN})</button>` : ''}</div>
      <div class="tags">${items.map(tagHtml).join('')}</div>
    </article>`;
  }

  function render(state) {
    if (!state.ready) { results.innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>'; return; }
    const q = norm(query);
    const { lots, byLot } = groupLots(state, q);
    if (!q) {
      results.innerHTML = `<h2 class="sec">ล็อตล่าสุด</h2>` +
        (lots.length ? lots.slice(0, 5).map((l) => cardHtml(l, byLot[l])).join('') : '<p class="empty">ยังไม่มีข้อมูล — เริ่มจากบันทึกรับเข้า</p>');
    } else if (!lots.length) {
      results.innerHTML = `<p class="empty">ไม่พบ “${W.h(query.trim())}”<br><small>ลองค้นด้วยรหัส lot เลข D/O หรือชื่อลูกค้า</small></p>`;
    } else {
      results.innerHTML = `<h2 class="sec">พบ ${lots.length} lot</h2>` + lots.slice(0, 30).map((l) => cardHtml(l, byLot[l])).join('');
    }
  }

  function onTag(id) {
    const s = W.db.state.stock.find((x) => x.id === id);
    if (!s) return;
    const ph = W.photoOf(s);
    const photo = ph ? `<img class="photo" src="${W.h(ph)}" alt="รูปม้วนผ้า">` : '';
    const ageRow = s.receivedAt
      ? (s.status === 'picked' && s.pickedAt ? ['เก็บอยู่นาน (จนถึงหยิบ)', W.ageHtml(s.receivedAt, s.pickedAt)] : ['เก็บมาแล้ว', W.ageHtml(s.receivedAt)])
      : null;
    const info = W.kv([
      ['Lot', W.h(s.lot)], s.doNo ? ['D/O', W.h(s.doNo)] : null, s.customer ? ['ลูกค้า', `<span class="cust-big">${W.h(s.customer)}</span>`] : null,
      ['สี', W.h(s.color)], s.size ? ['ขนาดผ้า', W.h(W.sizeLabel(s.size))] : null, s.form ? ['ผ้าพับ/ผ้าม้วน', W.h(W.formLabel(s.form))] : null, s.pallets > 1 ? ['พาเรท', `${s.pallet} จาก ${s.pallets}`] : null,
      ['จำนวน', `${W.fmtQty(s.qty)} ${W.unit}${s.pallets > 1 ? ' (รวมทุกพาเรทของสีนี้)' : ''}`],
      ['ตำแหน่ง', `<b>${W.h(s.loc)}</b><br><small class="muted">${W.h(W.locLabel(s.loc))}</small>`],
      ageRow
    ]) + photo;
    if (s.status === 'stored') {
      W.sheet({
        title: 'ยืนยันว่าหยิบแล้ว?', body: info,
        actions: [
          { label: 'ยังไม่หยิบ', kind: 'ghost' },
          { label: 'ยืนยัน หยิบแล้ว', kind: 'primary', onClick: async () => { await W.db.pick(id); W.toast('บันทึกจ่ายออก ' + s.loc, 'ok'); } }
        ]
      });
    } else {
      W.sheet({
        title: 'หยิบแล้ว', sub: s.pickedAt ? 'เมื่อ ' + W.fmtTime(s.pickedAt) : '', body: info,
        actions: [
          { label: 'ปิด', kind: 'ghost' },
          { label: 'ลบรายการนี้', kind: 'danger', onClick: () => { confirmRemove([id], s.loc); } },
          { label: 'ยกเลิกการหยิบ', kind: 'danger', onClick: async () => { await W.db.undoPick(id); W.toast('ยกเลิกแล้ว — ' + s.loc + ' กลับเป็นยังไม่หยิบ', 'ok'); } }
        ]
      });
    }
  }

  // ลบรายการที่หยิบแล้วออกจากหน้าค้นหา (ประวัติในหน้า "ประวัติ" ยังอยู่)
  function confirmRemove(ids, label) {
    W.sheet({
      title: 'ลบรายการที่หยิบแล้ว?',
      body: `<p class="sheet-sub">จะลบ ${W.h(label)} ออกจากหน้าค้นหา — ลบแล้วยกเลิกการหยิบไม่ได้ (ประวัติรับเข้า/จ่ายออกยังอยู่)</p>`,
      actions: [
        { label: 'ยกเลิก', kind: 'ghost' },
        { label: 'ลบ', kind: 'danger', onClick: async () => { await W.db.removePicked(ids); W.toast('ลบแล้ว ' + ids.length + ' รายการ', 'ok'); } }
      ]
    });
  }

  return {
    title: 'ค้นหา',
    mount(container) {
      el = container;
      if (W.pendingQuery != null) { query = W.pendingQuery; W.pendingQuery = null; }
      el.innerHTML = `<div class="searchbox">${W.icon.search}
          <input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="characters"
            placeholder="ค้นหา D/O, รหัส lot หรือชื่อลูกค้า" aria-label="ค้นหา D/O, รหัส lot หรือชื่อลูกค้า"></div>
        <div id="results"></div>`;
      input = el.querySelector('#q');
      results = el.querySelector('#results');
      input.value = query;
      let t;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = input.value; render(W.db.state); }, 150); });
      results.addEventListener('click', (e) => {
        const c = e.target.closest('[data-clear]');
        if (c) {
          const lot = c.dataset.clear;
          const ids = W.db.state.stock.filter((x) => x.lot === lot && x.status === 'picked').map((x) => x.id);
          if (ids.length) confirmRemove(ids, 'ที่หยิบแล้วของ ' + lot + ' (' + ids.length + ' พาเรท)');
          return;
        }
        const b = e.target.closest('.tag');
        if (b) onTag(b.dataset.id);
      });
    },
    update: render
  };
})(window.WMS);
