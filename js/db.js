// Data layer — Firestore ตรงจาก JS (หรือโหมดทดลองด้วย localStorage ถ้ายังไม่ตั้งค่า Firebase)
//
// Collections
//   stock/{id}  { lot, doNo, color, qty, loc, status:'stored'|'picked', photo?, receivedAt, pickedAt? }
//   slots/{loc} { stockId, lot, color, qty }   ← 1 ช่อง = 1 doc; มีอยู่ = ช่องเต็ม (ใช้กันบันทึกทับช่องเดียวกัน)
//   tx/{id}     { type:'in'|'out', stockId, lot, doNo, color, qty, loc, ts, note?, undo? }
window.WMS = window.WMS || {};
(function (W) {
  const C = WMS_CONFIG;
  const configured = !!(C.firebase && C.firebase.apiKey && !/^YOUR_/.test(C.firebase.apiKey));
  const listeners = new Set();
  const state = { stock: [], slots: {}, tx: [], ready: false, error: null, mode: configured ? 'firebase' : 'demo' };
  const emit = () => listeners.forEach((f) => f(state));

  // ================= Auth state (ใช้ร่วมกันทั้ง Firebase/Demo) =================
  const authState = { user: null, ready: false };
  const authListeners = new Set();
  const authEmit = () => authListeners.forEach((f) => f(authState));
  const domain = (C.auth && C.auth.usernameDomain) || '';
  const toEmail = (id) => { id = String(id || '').trim(); return id.includes('@') || !domain ? id : id + '@' + domain; };
  const toName = (email) => (domain && String(email).endsWith('@' + domain)) ? String(email).slice(0, -(domain.length + 1)) : String(email);
  const who = () => (authState.user && authState.user.email) || '';

  // ================= Firebase =================
  function firebaseBackend() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      state.error = new Error('โหลด Firebase SDK ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)');
      authState.ready = true; setTimeout(authEmit, 0);
      const boom = () => { throw state.error; };
      W.auth = mkAuth(boom, boom);
      return { receive: boom, pick: boom, undoPick: boom };
    }
    firebase.initializeApp(C.firebase);
    const fs = firebase.firestore();
    const auth = firebase.auth();
    try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* ไม่รองรับ → ข้าม */ }
    const col = (n) => fs.collection(n);

    // เริ่มฟังข้อมูลหลังล็อกอินเท่านั้น (rules ต้องมี auth) และหยุด/ล้างเมื่อออกจากระบบ
    let unsubs = [];
    const got = { stock: false, slots: false, tx: false };
    const done = (k) => { got[k] = true; state.ready = got.stock && got.slots && got.tx; state.error = null; emit(); };
    const fail = (e) => { state.error = e; emit(); };
    const start = () => {
      got.stock = got.slots = got.tx = false;
      unsubs = [
        col('stock').onSnapshot((s) => { state.stock = s.docs.map((d) => ({ id: d.id, ...d.data() })); done('stock'); }, fail),
        col('slots').onSnapshot((s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); state.slots = m; done('slots'); }, fail),
        col('tx').orderBy('ts', 'desc').limit(1000).onSnapshot((s) => { state.tx = s.docs.map((d) => ({ id: d.id, ...d.data() })); done('tx'); }, fail)
      ];
    };
    const stop = () => {
      unsubs.forEach((u) => u()); unsubs = [];
      state.stock = []; state.slots = {}; state.tx = []; state.ready = false; state.error = null; emit();
    };
    auth.onAuthStateChanged((u) => {
      authState.user = u ? { email: u.email, name: toName(u.email) } : null;
      authState.ready = true;
      u ? start() : stop();
      authEmit();
    });
    W.auth = mkAuth(
      (id, pw) => auth.signInWithEmailAndPassword(toEmail(id), pw),
      () => auth.signOut()
    );

    return {
      async receive({ lot, doNo, entries }) {
        const now = Date.now(), by = who();
        await fs.runTransaction(async (t) => {
          const refs = entries.map((e) => col('slots').doc(e.loc));
          const snaps = await Promise.all(refs.map((r) => t.get(r)));
          snaps.forEach((s, i) => { if (s.exists) throw new Error('SLOT_TAKEN:' + entries[i].loc); });
          entries.forEach((e, i) => {
            const sRef = col('stock').doc();
            const base = { lot, doNo, color: e.color, qty: e.qty, loc: e.loc };
            t.set(sRef, { ...base, status: 'stored', receivedAt: now, receivedBy: by, ...(e.photo ? { photo: e.photo } : {}) });
            t.set(refs[i], { stockId: sRef.id, lot, color: e.color, qty: e.qty });
            t.set(col('tx').doc(), { ...base, type: 'in', stockId: sRef.id, ts: now, by });
          });
        });
      },
      async pick(id) {
        const by = who();
        await fs.runTransaction(async (t) => {
          const sRef = col('stock').doc(id);
          const s = await t.get(sRef);
          if (!s.exists) throw new Error('NOT_FOUND');
          const d = s.data();
          if (d.status !== 'stored') throw new Error('ALREADY_PICKED');
          const now = Date.now();
          t.update(sRef, { status: 'picked', pickedAt: now, pickedBy: by });
          t.delete(col('slots').doc(d.loc));
          t.set(col('tx').doc(), { type: 'out', stockId: id, lot: d.lot, doNo: d.doNo || '', color: d.color, qty: d.qty, loc: d.loc, ts: now, by });
        });
      },
      async undoPick(id) {
        const by = who();
        await fs.runTransaction(async (t) => {
          const sRef = col('stock').doc(id);
          const s = await t.get(sRef);
          if (!s.exists) throw new Error('NOT_FOUND');
          const d = s.data();
          const slotRef = col('slots').doc(d.loc);
          const sl = await t.get(slotRef);
          if (sl.exists) throw new Error('SLOT_TAKEN:' + d.loc);
          const now = Date.now();
          t.update(sRef, { status: 'stored', pickedAt: firebase.firestore.FieldValue.delete(), pickedBy: firebase.firestore.FieldValue.delete() });
          t.set(slotRef, { stockId: id, lot: d.lot, color: d.color, qty: d.qty });
          t.set(col('tx').doc(), { type: 'in', undo: true, note: 'ยกเลิกการหยิบ', stockId: id, lot: d.lot, doNo: d.doNo || '', color: d.color, qty: d.qty, loc: d.loc, ts: now, by });
        });
      }
    };
  }

  function mkAuth(signIn, signOut) {
    return {
      state: authState,
      onChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
      signIn, signOut,
      short: toName
    };
  }

  // ================= Demo (localStorage) =================
  function demoBackend() {
    const KEY = 'wms_demo_v2';
    const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    let db;
    const save = () => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { W.toast('พื้นที่เก็บข้อมูลในเครื่องเต็ม (รูปใหญ่เกินไป)', 'error'); }
    };
    const publish = () => {
      state.stock = db.stock;
      state.slots = db.slots;
      state.tx = db.tx.slice().sort((a, b) => b.ts - a.ts);
      state.ready = true;
      emit();
    };
    function seed() {
      const now = Date.now(), D = 864e5;
      db = { stock: [], slots: {}, tx: [] };
      // [lot, D/O, color, qty, loc, daysAgo, pickedDaysAgo|null]
      [
        ['L2609-001', 'DO-5501', 'ดำ', 60, 'H-01-1', 2, null],
        ['L2609-001', 'DO-5501', 'น้ำเงิน', 40, 'H-01-2', 2, null],
        ['L2609-002', 'DO-5502', 'ขาว', 50, 'P-01-1', 1, null],
        ['L2608-014', 'DO-5488', 'ดำ', 80, 'H-02-1', 20, 6],
        ['L2608-014', 'DO-5488', 'แดง', 30, 'L-01-1', 20, 9],
        ['L2608-015', 'DO-5490', 'ดำ', 70, 'H-03-1', 18, 4],
        ['L2608-015', 'DO-5490', 'น้ำเงิน', 45, 'H-04-1', 18, 3],
        ['L2608-015', 'DO-5490', 'ขาว', 20, 'I-01-1', 18, 5],
        ['L2608-016', 'DO-5493', 'เขียว', 25, 'B-01-1', 15, null]
      ].forEach(([lot, doNo, color, qty, loc, ago, picked]) => {
        const id = uid();
        const base = { lot, doNo, color, qty, loc };
        db.stock.push({ id, ...base, status: picked == null ? 'stored' : 'picked', receivedAt: now - ago * D, ...(picked != null ? { pickedAt: now - picked * D } : {}) });
        db.tx.push({ id: uid(), ...base, type: 'in', stockId: id, ts: now - ago * D });
        if (picked == null) db.slots[loc] = { stockId: id, lot, color, qty };
        else db.tx.push({ id: uid(), ...base, type: 'out', stockId: id, ts: now - picked * D });
      });
      save();
    }
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || !db.stock) seed();
    // ล็อกอินโหมดทดลอง: รับชื่ออะไรก็ได้ (จำไว้ในเครื่อง) — เพื่อทดสอบหน้าตาเท่านั้น
    const UKEY = 'wms_demo_user';
    try { const u = localStorage.getItem(UKEY); if (u) authState.user = { email: u, name: toName(u) }; } catch (e) { /* ignore */ }
    authState.ready = true;
    W.auth = mkAuth(
      async (id, pw) => {
        if (!String(id).trim() || !pw) throw Object.assign(new Error('demo'), { code: 'auth/missing-credentials' });
        const email = toEmail(id);
        try { localStorage.setItem(UKEY, email); } catch (e) { /* ignore */ }
        authState.user = { email, name: toName(email) }; authEmit();
      },
      async () => { try { localStorage.removeItem(UKEY); } catch (e) { /* ignore */ } authState.user = null; authEmit(); }
    );
    setTimeout(publish, 0);

    // จำลองความหน่วงเล็กน้อยให้เหมือนใช้งานจริง
    const wait = () => new Promise((r) => setTimeout(r, 120));
    return {
      async receive({ lot, doNo, entries }) {
        await wait();
        entries.forEach((e) => { if (db.slots[e.loc]) throw new Error('SLOT_TAKEN:' + e.loc); });
        const now = Date.now();
        entries.forEach((e) => {
          const id = uid();
          const base = { lot, doNo, color: e.color, qty: e.qty, loc: e.loc };
          db.stock.push({ id, ...base, status: 'stored', receivedAt: now, ...(e.photo ? { photo: e.photo } : {}) });
          db.slots[e.loc] = { stockId: id, lot, color: e.color, qty: e.qty };
          db.tx.push({ id: uid(), ...base, type: 'in', stockId: id, ts: now, by: who() });
        });
        save(); publish();
      },
      async pick(id) {
        await wait();
        const s = db.stock.find((x) => x.id === id);
        if (!s) throw new Error('NOT_FOUND');
        if (s.status !== 'stored') throw new Error('ALREADY_PICKED');
        const now = Date.now();
        s.status = 'picked'; s.pickedAt = now;
        delete db.slots[s.loc];
        db.tx.push({ id: uid(), type: 'out', stockId: id, lot: s.lot, doNo: s.doNo || '', color: s.color, qty: s.qty, loc: s.loc, ts: now, by: who() });
        save(); publish();
      },
      async undoPick(id) {
        await wait();
        const s = db.stock.find((x) => x.id === id);
        if (!s) throw new Error('NOT_FOUND');
        if (db.slots[s.loc]) throw new Error('SLOT_TAKEN:' + s.loc);
        s.status = 'stored'; delete s.pickedAt;
        db.slots[s.loc] = { stockId: id, lot: s.lot, color: s.color, qty: s.qty };
        db.tx.push({ id: uid(), type: 'in', undo: true, note: 'ยกเลิกการหยิบ', stockId: id, lot: s.lot, doNo: s.doNo || '', color: s.color, qty: s.qty, loc: s.loc, ts: Date.now(), by: who() });
        save(); publish();
      }
    };
  }

  const backend = configured ? firebaseBackend() : demoBackend();
  W.db = {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    receive: (p) => backend.receive(p),
    pick: (id) => backend.pick(id),
    undoPick: (id) => backend.undoPick(id)
  };
})(window.WMS);
