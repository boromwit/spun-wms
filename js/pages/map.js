// หน้า 3: แผนที่คลัง — Zone > Rack > Level, ว่าง (เทา) / เต็ม (เหลืองทอง)
window.WMS = window.WMS || {};
WMS.pages = WMS.pages || {};
WMS.pages.map = (function (W) {
  let el, zone = WMS_CONFIG.zones[0].id;

  function counts(state, zid, rowId) {
    const all = W.locs.filter((l) => (!zid || l.zone === zid) && (!rowId || l.row === rowId));
    const full = all.filter((l) => state.slots[l.code]).length;
    return { total: all.length, full, free: all.length - full };
  }

  function cell(state, l) {
    const s = state.slots[l.code];
    return s
      ? `<button class="cell full" data-loc="${l.code}" aria-label="${l.code} เต็ม lot ${W.h(s.lot)}"><span class="lv">ชั้น ${l.level}</span><span class="cl">${W.h(s.lot)}</span><span class="cq">${W.fmtQty(s.qty)}</span></button>`
      : `<button class="cell free" data-loc="${l.code}" aria-label="${l.code} ว่าง"><span class="lv">ชั้น ${l.level}</span><span class="cl">ว่าง</span></button>`;
  }

  function render(state) {
    if (!state.ready) { el.innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>'; return; }
    const z = WMS_CONFIG.zones.find((x) => x.id === zone);
    const rows = z.rows.map((row) => {
      const bays = [];
      for (let b = 1; b <= row.bays; b++) {
        bays.push(`<div class="rack"><div class="rack-h">${row.id}-${W.pad2(b)}</div>` +
          W.levels.map((lv) => cell(state, W.locMap[`${row.id}-${W.pad2(b)}-${lv}`])).join('') + '</div>');
      }
      const rc = counts(state, null, row.id);
      return `<section class="shelf"><h2 class="shelf-h"><span class="shelf-id">${row.id}</span>
        <span class="muted">${row.bays} ช่อง · ว่าง ${rc.free}/${rc.total} · Class ${row.abc}</span></h2>
        <div class="rack-grid">${bays.join('')}</div></section>`;
    });
    const cz = counts(state, zone), ca = counts(state);
    el.innerHTML = `<div class="zone-tabs" role="tablist">${WMS_CONFIG.zones.map((x) => {
      const c = counts(state, x.id);
      const letters = x.rows[0].id + '–' + x.rows[x.rows.length - 1].id;
      return `<button role="tab" aria-selected="${x.id === zone}" class="ztab ${x.id === zone ? 'on' : ''}" data-zone="${x.id}">${W.h(x.name)} <small>${letters}</small><small>ว่าง ${c.free}/${c.total}</small></button>`;
    }).join('')}</div>
      ${rows.join('')}
      <div class="summary-bar">
        <div class="sum"><i class="dot free"></i>ว่าง <b>${cz.free}</b></div>
        <div class="sum"><i class="dot full"></i>เต็ม <b>${cz.full}</b></div>
        <div class="sum all">ทั้งคลัง ว่าง ${ca.free} · เต็ม ${ca.full}</div>
      </div>`;
  }

  function detail(code) {
    const state = W.db.state, s = state.slots[code], l = W.locMap[code];
    if (!s) {
      return W.sheet({ title: code, sub: W.locLabel(code), body: '<p class="empty">ช่องว่าง</p>', actions: [{ label: 'ปิด', kind: 'ghost' }] });
    }
    const st = state.stock.find((x) => x.id === s.stockId) || {};
    W.sheet({
      title: code, sub: W.locLabel(code),
      body: W.kv([
        ['Lot', W.h(s.lot)], st.doNo ? ['D/O', W.h(st.doNo)] : null,
        ['สี', W.h(s.color)], ['จำนวน', `${W.fmtQty(s.qty)} ${W.unit}`],
        st.receivedAt ? ['รับเข้าเมื่อ', W.fmtTime(st.receivedAt)] : null
      ]) + (st.photo ? `<img class="photo" src="${W.h(st.photo)}" alt="รูปม้วนผ้า">` : ''),
      actions: [
        { label: 'ปิด', kind: 'ghost' },
        { label: 'ดูใน “ค้นหา”', kind: 'primary', onClick: () => { W.pendingQuery = s.lot; location.hash = '#/search'; } }
      ]
    });
  }

  return {
    title: 'แผนที่คลัง',
    mount(container) {
      el = container;
      el.addEventListener('click', (e) => {
        const t = e.target.closest('.ztab'), c = e.target.closest('.cell');
        if (t) { zone = t.dataset.zone; render(W.db.state); }
        else if (c) detail(c.dataset.loc);
      });
    },
    update: render
  };
})(window.WMS);
