// ABC Analysis ตามตารางในงานวิจัย: จัด class ให้ "ชนิดของผ้า" 7 ชนิดจากความยาว (หลา) สะสม แล้วแนะนำช่องว่างตาม class
//   A = ขายเร็ว → ช่องใกล้ประตู | B = กลาง | C = ช้า — class ของแต่ละชนิดคำนวณจาก WMS_CONFIG.abc.types (ไม่ได้อ่านประวัติจ่ายออก)
//   ชนิดผ้าของแต่ละรายการหาจากข้อมูลที่กรอกตอนรับเข้า:
//     ล็อก B → ผ้าคุณภาพไม่ตรงตามต้องการ · ล็อก L → ผ้าผลิตเกิน
//     ล็อก 3G → ผ้าพับ (เลือกผ้าพับ) หรือ ผ้าม้วนคุณภาพสูง = ขาว/สี (จากชื่อสี) × ขนาดเล็ก/ใหญ่
window.WMS = window.WMS || {};
(function (W) {
  const cfg = WMS_CONFIG.abc;
  const PREF = { A: ['A', 'B', 'C'], B: ['B', 'A', 'C'], C: ['C', 'B', 'A'] };

  // ตาราง: เรียงตามความยาวมาก→น้อย + เปอร์เซ็นต์สะสม + class
  const total = cfg.types.reduce((a, t) => a + t.yards, 0);
  let cum = 0;
  const table = cfg.types.slice().sort((a, b) => b.yards - a.yards).map((t, i) => {
    cum += t.yards;
    const share = cum / total;
    const cls = i === 0 || share <= cfg.aCut + 1e-9 ? 'A' : share <= cfg.bCut + 1e-9 ? 'B' : 'C';
    return { ...t, share, cls };
  });
  const byId = Object.fromEntries(table.map((t) => [t.id, t]));
  const isWhite = (c) => {
    const s = String(c || '').trim().toLowerCase();
    return !!s && cfg.whiteWords.some((w) => s.includes(w.toLowerCase()));
  };

  W.abc = {
    table,
    // ctx = { lock: '3G'|'B'|'L', size: 'small'|'large', form: 'fold'|'roll', color } → id ชนิดผ้า หรือ null ถ้าข้อมูลยังไม่ครบ
    typeOf({ lock, size, form, color }) {
      if (lock === 'B') return 'low-quality';
      if (lock === 'L') return 'excess';
      if (lock !== '3G') return null;
      if (form === 'fold') return 'fold';
      if (form === 'roll' && size && String(color || '').trim()) return (isWhite(color) ? 'white-' : 'color-') + size;
      return null;
    },
    // → { cls:'A'|'B'|'C', text, type }  (ข้อมูลไม่ครบ → class B ชั่วคราว)
    classOf(ctx) {
      const id = this.typeOf(ctx || {});
      const t = id && byId[id];
      if (t) return { cls: t.cls, type: t, text: `ชนิดผ้า: ${t.name}` };
      const lock = ctx && ctx.lock;
      const hint = !lock ? 'เลือกล็อกก่อน' : lock === '3G' && !ctx.form ? 'เลือกผ้าพับ/ผ้าม้วน' : lock === '3G' && !ctx.size ? 'เลือกขนาดผ้า' : 'ระบุสี';
      return { cls: 'B', type: null, text: `${hint}เพื่อให้แนะนำแม่นขึ้น (ตอนนี้ใช้ class B)` };
    },
    // ช่องว่างเรียงตามความเหมาะสมกับ class (ทุกช่อง) — exclude = Set ของ code ที่ไม่เอา
    ranked(cls, state, exclude) {
      const order = PREF[cls];
      return W.locs
        .filter((l) => !state.slots[l.code] && !(exclude && exclude.has(l.code)))
        .sort((a, b) => order.indexOf(a.abc) - order.indexOf(b.abc) || a.order - b.order);
    },
    suggest(cls, state, exclude, n = 3) { return this.ranked(cls, state, exclude).slice(0, n); }
  };
})(window.WMS);
