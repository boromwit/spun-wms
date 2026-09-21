// Router (hash) + bottom nav + banner + ล็อกอิน
(function (W) {
  const routes = ['search', 'receive', 'map', 'history'];
  const navLabel = { search: 'ค้นหา', receive: 'รับเข้า', map: 'แผนที่', history: 'ประวัติ' };
  const main = document.getElementById('main');
  const banner = document.getElementById('banner');
  const loginRoot = document.getElementById('login-root');
  const userBtn = document.getElementById('user-btn');
  let cur = null;

  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    const r = a.dataset.route;
    a.innerHTML = `${W.icon[r]}<span>${navLabel[r]}</span>`;
  });

  function go() {
    if (!W.auth.state.user) return;
    const name = location.hash.replace(/^#\//, '').split('?')[0];
    const route = routes.includes(name) ? name : 'search';
    cur = W.pages[route];
    // container ใหม่ทุกครั้ง เพื่อไม่ให้ event listener ของหน้าเก่าค้าง
    const page = document.createElement('div');
    main.replaceChildren(page);
    main.className = 'page-' + route;
    cur.mount(page);
    cur.update && cur.update(W.db.state);
    document.getElementById('page-title').textContent = cur.title;
    document.title = cur.title + ' · WMS SPUN';
    document.querySelectorAll('.bottom-nav a').forEach((a) => {
      const on = a.dataset.route === route;
      a.classList.toggle('on', on);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  function showBanner(state) {
    if (!W.auth.state.user) { banner.hidden = true; return; }
    if (state.error) {
      banner.hidden = false; banner.className = 'banner err';
      banner.textContent = 'เชื่อมต่อฐานข้อมูลไม่ได้: ' + (state.error.message || state.error);
    } else if (state.mode === 'demo') {
      banner.hidden = false; banner.className = 'banner';
      banner.textContent = 'โหมดทดลอง — ข้อมูลเก็บในเครื่องนี้เท่านั้น (ตั้งค่า Firebase ใน js/config.js เพื่อใช้งานจริง)';
    } else banner.hidden = true;
  }

  // ---------- ล็อกอิน ----------
  const AUTH_ERR = {
    'auth/invalid-credential': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    'auth/wrong-password': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    'auth/user-not-found': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-email': 'รูปแบบชื่อผู้ใช้ไม่ถูกต้อง',
    'auth/missing-password': 'กรุณากรอกรหัสผ่าน',
    'auth/user-disabled': 'บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ',
    'auth/too-many-requests': 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'ไม่มีอินเทอร์เน็ต ลองใหม่อีกครั้ง',
    'auth/operation-not-allowed': 'ยังไม่ได้เปิดการล็อกอินแบบอีเมล/รหัสผ่านใน Firebase',
    'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้เพิ่มใน Firebase (Authentication → Settings → Authorized domains)',
    'auth/missing-credentials': 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
  };

  function renderLogin() {
    loginRoot.innerHTML = `<div class="login"><form class="login-card" novalidate>
        <div class="login-logo">SPUN</div>
        <h1>เข้าสู่ระบบ</h1><p class="muted">WMS คลังผ้าม้วน</p>
        <label class="field">ชื่อผู้ใช้<input id="lg-u" class="in" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
        <label class="field" style="margin-top:10px">รหัสผ่าน<input id="lg-p" class="in" type="password" autocomplete="current-password"></label>
        <p id="lg-err" class="login-err" role="alert"></p>
        <button class="btn primary block big" type="submit">เข้าสู่ระบบ</button>
        <p class="muted login-note">${W.db.state.mode === 'demo' ? 'โหมดทดลอง: ใส่ชื่อและรหัสอะไรก็ได้' : 'ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ'}</p>
      </form></div>`;
    const f = loginRoot.querySelector('form'), err = loginRoot.querySelector('#lg-err'), btn = f.querySelector('button');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = ''; btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ…';
      try { await W.auth.signIn(f.querySelector('#lg-u').value, f.querySelector('#lg-p').value); }
      catch (ex) {
        err.textContent = AUTH_ERR[ex && ex.code] || ('เข้าสู่ระบบไม่สำเร็จ: ' + ((ex && ex.message) || ex));
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
      }
    });
    f.querySelector('#lg-u').focus();
  }

  let shown = null; // 'login' | 'app' | null
  function applyAuth() {
    const { user, ready } = W.auth.state;
    if (!ready) return;
    if (!user) {
      if (shown === 'login') return;
      shown = 'login';
      cur = null; main.replaceChildren();
      document.body.classList.add('logged-out');
      userBtn.hidden = true;
      showBanner(W.db.state);
      renderLogin();
      document.title = 'เข้าสู่ระบบ · WMS SPUN';
    } else {
      if (shown === 'app') return;
      shown = 'app';
      document.body.classList.remove('logged-out');
      loginRoot.innerHTML = '';
      userBtn.hidden = false;
      userBtn.textContent = user.name;
      showBanner(W.db.state);
      go();
    }
  }

  userBtn.addEventListener('click', () => {
    const u = W.auth.state.user;
    if (!u) return;
    W.sheet({
      title: 'บัญชีผู้ใช้', sub: u.name,
      body: '<p class="sheet-sub">ต้องการออกจากระบบหรือไม่?</p>',
      actions: [{ label: 'ยกเลิก', kind: 'ghost' },
        { label: 'ออกจากระบบ', kind: 'danger', onClick: async () => { await W.auth.signOut(); } }]
    });
  });

  W.auth.onChange(applyAuth);
  W.db.subscribe((state) => { showBanner(state); cur && cur.update && cur.update(state); });
  window.addEventListener('hashchange', go);
  applyAuth();
})(window.WMS);
