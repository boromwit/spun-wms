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
    if (q) lots = lots.filter((l) => l.includes(q) || byLot[l].some((s) => (s.doNo || '').includes(q)));
    const latest = (l) => Math.max(...byLot[l].map((s) => s.receivedAt || 0));
    lots.sort((a, b) => latest(b) - latest(a));
    return { lots, byLot };
  }

  function tagHtml(s) {
    const picked = s.status === 'picked';
    return `<button class="tag ${picked ? 'picked' : 'pending'}" data-id="${W.h(s.id)}"
        aria-label="${W.h(s.loc)} ${picked ? 'หยิบแล้ว' : 'ยังไม่หยิบ'}">
      <span class="tag-loc">${W.h(s.loc)}</span>
      <span class="tag-sub">${W.h(s.color)} · ${W.fmtQty(s.qty)}</span>
      <span class="tag-state">${picked ? W.icon.check + ' หยิบแล้ว' : 'ยังไม่หยิบ'}</span>
    </button>`;
  }

  function cardHtml(lot, items) {
    const dos = [...new Set(items.map((s) => s.doNo).filter(Boolean))];
    const stored = items.filter((s) => s.status === 'stored');
    const sum = stored.reduce((a, s) => a + Number(s.qty || 0), 0);
    const pickedN = items.length - stored.length;
    items = items.slice().sort((a, b) => (a.status === 'picked') - (b.status === 'picked') || a.loc.localeCompare(b.loc));
    return `<article class="card lot-card">
      <div class="lot-head">
        <div><div class="lot-code">${W.h(lot)}</div>
          <div class="lot-do">${dos.length ? dos.map((d) => `<span class="chip">D/O ${W.h(d)}</span>`).join('') : '<span class="muted">ไม่มี D/O</span>'}</div></div>
        <div class="lot-sum"><b>${W.fmtQty(sum)}</b><span>${W.unit} คงเหลือ</span></div>
      </div>
      <div class="lot-progress">หยิบแล้ว ${pickedN}/${items.length} ตำแหน่ง</div>
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
      results.innerHTML = `<p class="empty">ไม่พบ “${W.h(query.trim())}”<br><small>ลองค้นด้วยรหัส lot หรือเลข D/O</small></p>`;
    } else {
      results.innerHTML = `<h2 class="sec">พบ ${lots.length} lot</h2>` + lots.slice(0, 30).map((l) => cardHtml(l, byLot[l])).join('');
    }
  }

  function onTag(id) {
    const s = W.db.state.stock.find((x) => x.id === id);
    if (!s) return;
    const photo = s.photo ? `<img class="photo" src="${W.h(s.photo)}" alt="รูปม้วนผ้า">` : '';
    const info = W.kv([
      ['Lot', W.h(s.lot)], s.doNo ? ['D/O', W.h(s.doNo)] : null,
      ['สี', W.h(s.color)], ['จำนวน', `${W.fmtQty(s.qty)} ${W.unit}`],
      ['ตำแหน่ง', `<b>${W.h(s.loc)}</b><br><small class="muted">${W.h(W.locLabel(s.loc))}</small>`]
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
          { label: 'ยกเลิกการหยิบ', kind: 'danger', onClick: async () => { await W.db.undoPick(id); W.toast('ยกเลิกแล้ว — ' + s.loc + ' กลับเป็นยังไม่หยิบ', 'ok'); } }
        ]
      });
    }
  }

  return {
    title: 'ค้นหา',
    mount(container) {
      el = container;
      if (W.pendingQuery != null) { query = W.pendingQuery; W.pendingQuery = null; }
      el.innerHTML = `<div class="searchbox">${W.icon.search}
          <input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="characters"
            placeholder="ค้นหา D/O หรือรหัส lot" aria-label="ค้นหา D/O หรือรหัส lot"></div>
        <div id="results"></div>`;
      input = el.querySelector('#q');
      results = el.querySelector('#results');
      input.value = query;
      let t;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = input.value; render(W.db.state); }, 150); });
      results.addEventListener('click', (e) => {
        const b = e.target.closest('.tag');
        if (b) onTag(b.dataset.id);
      });
    },
    update: render
  };
})(window.WMS);
