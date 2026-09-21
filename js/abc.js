// ABC Analysis: จัด class ให้ "สี" จากยอดจ่ายออกย้อนหลัง แล้วแนะนำช่องว่างตาม class
//   A = ขายเร็ว → ช่องใกล้ประตู (Zone A) | B = กลาง | C = ช้า/สีใหม่ที่มีประวัติแล้วแต่ยังไม่เคยจ่าย
window.WMS = window.WMS || {};
(function (W) {
  const cfg = WMS_CONFIG.abc;
  const key = (c) => String(c || '').trim().toLowerCase();
  const PREF = { A: ['A', 'B', 'C'], B: ['B', 'A', 'C'], C: ['C', 'B', 'A'] };
  let memoTx = null, memo = null;

  function analyse(state) {
    if (memoTx === state.tx) return memo;
    // จ่ายออกที่ถูก "ยกเลิกการหยิบ" ภายหลังต้องไม่นับ
    const pending = new Map();
    state.tx.slice().sort((a, b) => a.ts - b.ts).forEach((t) => {
      if (t.type === 'out') pending.set(t.stockId, t);
      else if (t.undo) pending.delete(t.stockId);
    });
    const since = Date.now() - cfg.windowDays * 864e5;
    const outs = [...pending.values()].filter((t) => t.ts >= since);
    const qtyBy = {};
    let total = 0;
    outs.forEach((t) => { const q = Number(t.qty) || 0; qtyBy[key(t.color)] = (qtyBy[key(t.color)] || 0) + q; total += q; });
    const cls = {};
    let cum = 0;
    Object.entries(qtyBy).sort((a, b) => b[1] - a[1]).forEach(([k, q]) => {
      const share = total ? cum / total : 1;   // สัดส่วนสะสม "ก่อน" รวมสีนี้ → สีอันดับ 1 เป็น A เสมอ
      cls[k] = share < cfg.aCut ? 'A' : share < cfg.bCut ? 'B' : 'C';
      cum += q;
    });
    memoTx = state.tx;
    memo = { cls, reliable: outs.length >= cfg.minTx };
    return memo;
  }

  W.abc = {
    // → {cls:'A'|'B'|'C', reason:'history'|'new'|'nodata'|'empty'}
    classOf(color, state) {
      const a = analyse(state);
      if (!key(color)) return { cls: 'B', reason: 'empty' };
      if (!a.reliable) return { cls: 'B', reason: 'nodata' };
      const c = a.cls[key(color)];
      return c ? { cls: c, reason: 'history' } : { cls: 'C', reason: 'new' };
    },
    // ช่องว่างเรียงตามความเหมาะสมกับ class (ทุกช่อง) — exclude = Set ของ code ที่ไม่เอา
    ranked(cls, state, exclude) {
      const order = PREF[cls];
      return W.locs
        .filter((l) => !state.slots[l.code] && !(exclude && exclude.has(l.code)))
        .sort((a, b) => order.indexOf(a.abc) - order.indexOf(b.abc) || a.order - b.order);
    },
    suggest(cls, state, exclude, n = 3) { return this.ranked(cls, state, exclude).slice(0, n); },
    reasonText(r) {
      return {
        history: 'ขายเร็วเทียบกับสีอื่น ๆ',
        new: 'ยังไม่เคยจ่ายออกในช่วงที่ผ่านมา',
        nodata: 'ข้อมูลจ่ายออกยังไม่พอ ใช้ค่ากลาง',
        empty: 'ระบุสีเพื่อให้แนะนำแม่นขึ้น'
      }[r];
    }
  };
})(window.WMS);
