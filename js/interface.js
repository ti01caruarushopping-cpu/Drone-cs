// ==========================================
// INTERFACE.JS — HUD, BOTÕES, PAINÉIS, SCANNER, LOADING
// ==========================================
window.App = window.App || {};

(function () {
  'use strict';

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  const VIEW_BTNS = ['reset', 'front', 'rear', 'top', 'bottom'];
  let dom = {};
  let scanTimers = [];
  let toastTimer = null;
  let gizmoCtx = null;

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================
  function init() {
    dom = {
      loading: $('#loading-screen'), bar: $('#boot-bar-fill'), pct: $('#boot-pct'),
      status: $('#boot-status'), note: $('#boot-note'), enter: $('#enter-btn'),
      app: $('#app'), viewer: $('#viewer'), cursor: $('#cursor'), toast: $('#toast'),
      compPanel: $('#component-panel'), techPanel: $('#tech-panel'),
      compTitle: $('#comp-title'), compEmpty: $('#comp-empty'), compRows: $('#comp-rows'),
      scanPanel: $('#scan-panel'), scanList: $('#scan-list'), scanDone: $('#scan-done'),
      gizmo: $('#gizmo')
    };

    // Botões de ação do painel inferior
    $$('[data-action]').forEach(function (b) {
      b.addEventListener('click', function () {
        const fn = App.actions && App.actions[b.getAttribute('data-action')];
        if (fn) fn();
      });
    });

    // Chips de seleção de componente
    $$('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        const comp = c.getAttribute('data-comp');
        if (App.actions) App.actions.select(c.classList.contains('active') ? null : comp);
      });
    });

    // Modais (celular)
    $$('[data-ui]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = b.getAttribute('data-ui');
        if (a === 'open-data') { dom.techPanel.classList.add('open'); dom.compPanel.classList.remove('open'); }
        if (a === 'close-data') dom.techPanel.classList.remove('open');
        if (a === 'open-comp') { dom.compPanel.classList.add('open'); dom.techPanel.classList.remove('open'); }
        if (a === 'close-comp') dom.compPanel.classList.remove('open');
      });
    });

    // Relógio do sistema
    function tickClock() {
      const d = new Date();
      const p = function (n) { return String(n).padStart(2, '0'); };
      $('#clock').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    tickClock();
    setInterval(tickClock, 1000);

    // Cursor tecnológico (apenas mouse)
    dom.viewer.addEventListener('pointerleave', function () { dom.cursor.classList.remove('visible'); });

    if (dom.gizmo) gizmoCtx = dom.gizmo.getContext('2d');
  }

  // ==========================================
  // TELA DE INICIALIZAÇÃO
  // ==========================================
  function startBoot(readyPromise) {
    const dur = App.CONFIG.bootDuration;
    const t0 = performance.now();
    let loaded = false;
    readyPromise.then(function () { loaded = true; }, function () { loaded = true; });

    function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      let shown = p < 1 ? Math.floor(p * 100) : (loaded ? 100 : 99);
      dom.bar.style.width = shown + '%';
      dom.pct.textContent = shown + '%';
      dom.status.textContent = shown < 70 ? 'LOADING 3D MODEL' : (shown < 100 ? 'VERIFYING AIRFRAME' : 'SYSTEM READY');
      if (shown >= 100) {
        dom.enter.disabled = false;
        dom.enter.focus({ preventScroll: true });
      } else {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);

    dom.enter.addEventListener('click', function () {
      dom.loading.classList.add('hide');
      dom.app.classList.add('ready');
      setTimeout(function () { dom.loading.style.display = 'none'; }, 800);
      if (App.onEnter) App.onEnter();
    });
  }

  function setModelSource(src) {
    if (src === 'fallback') {
      dom.note.textContent = 'GLB MODEL NOT FOUND — USING PROCEDURAL MODEL';
    } else {
      dom.note.textContent = '';
    }
    const mv = $('#model-val');
    if (mv) mv.textContent = src === 'glb' ? 'MAVIC 3 ENTERPRISE (GLB)' : 'MAVIC 3 ENTERPRISE (PROCEDURAL)';
  }

  // ==========================================
  // ERROS
  // ==========================================
  function showFatal(msg) {
    const f = $('#fatal');
    $('#fatal-msg').textContent = msg;
    f.hidden = false;
    const w = $('#webgl-val');
    if (w) w.textContent = 'INACTIVE';
  }

  function toast(msg, ms) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dom.toast.classList.remove('show'); }, ms || 3000);
  }

  // ==========================================
  // BOTÕES
  // ==========================================
  function setButton(name, on) {
    const b = $('[data-action="' + name + '"]');
    if (!b) return;
    b.classList.toggle('on', !!on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const st = $('.st', b);
    if (st) st.textContent = on ? 'ON' : 'OFF';
  }

  // Botões de vista (RESET/FRONT/REAR/TOP/BOTTOM) — somente um ativo por vez
  function setViewActive(name) {
    VIEW_BTNS.forEach(function (n) {
      const b = $('[data-action="' + n + '"]');
      if (b) b.classList.toggle('on', n === name);
    });
  }

  function setMode(tech) {
    $('#mode-val').textContent = tech ? 'TECHNICAL' : 'ENGINEERING';
    document.body.classList.toggle('tech', !!tech);
  }

  // ==========================================
  // HUD (rotação, posição, FPS, gizmo XYZ)
  // ==========================================
  function sign(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2); }

  function updateHUD(d) {
    $('#yaw-val').textContent = d.yaw.toFixed(1) + '°';
    $('#pitch-val').textContent = d.pitch.toFixed(1) + '°';
    $('#roll-val').textContent = d.roll.toFixed(1) + '°';
    $('#pos-x').textContent = sign(d.pos[0]);
    $('#pos-y').textContent = sign(d.pos[1]);
    $('#pos-z').textContent = sign(d.pos[2]);
    $('#fps-val').textContent = d.fps;
    $('#tech-coord').textContent = 'CAM ' + sign(d.pos[0]) + ' ' + sign(d.pos[1]) + ' ' + sign(d.pos[2]);
    drawGizmo(d.camQuat);
  }

  // Indicador X/Y/Z que acompanha a orientação da câmera
  function drawGizmo(q) {
    if (!gizmoCtx || !q) return;
    const g = gizmoCtx, W = 84, cx = W / 2, cy = W / 2, len = 28;
    g.clearRect(0, 0, W, W);
    const inv = q.clone().invert();
    const axes = [
      { v: new THREE.Vector3(1, 0, 0), c: '#ff5c5c', l: 'X' },
      { v: new THREE.Vector3(0, 1, 0), c: '#00ff9c', l: 'Y' },
      { v: new THREE.Vector3(0, 0, 1), c: '#00d9ff', l: 'Z' }
    ].map(function (a) { a.p = a.v.clone().applyQuaternion(inv); return a; });
    axes.sort(function (a, b) { return a.p.z - b.p.z; }); // desenha os mais distantes primeiro
    g.lineWidth = 2; g.font = '10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    axes.forEach(function (a) {
      const x = cx + a.p.x * len, y = cy - a.p.y * len;
      g.globalAlpha = a.p.z < -0.2 ? 0.45 : 1;
      g.strokeStyle = a.c; g.fillStyle = a.c;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      g.fillText(a.l, cx + a.p.x * (len + 9), cy - a.p.y * (len + 9));
    });
    g.globalAlpha = 1;
  }

  // ==========================================
  // PAINEL DE COMPONENTES
  // ==========================================
  function showComponent(comp) {
    $$('.chip').forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-comp') === comp); });
    const info = comp && App.Drone.COMPONENT_INFO[comp];
    if (!info) {
      dom.compTitle.textContent = 'COMPONENT ANALYSIS';
      dom.compEmpty.hidden = false;
      dom.compRows.hidden = true;
      dom.compPanel.classList.remove('open');
      return;
    }
    dom.compTitle.textContent = info.title;
    dom.compEmpty.hidden = true;
    dom.compRows.innerHTML = '';
    info.rows.forEach(function (r) {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = r[0];
      const dd = document.createElement('dd'); dd.textContent = r[1];
      if (r[0] === 'STATUS') dd.className = 'ok';
      row.appendChild(dt); row.appendChild(dd);
      dom.compRows.appendChild(row);
    });
    dom.compRows.hidden = false;
    dom.compRows.style.animation = 'none';
    void dom.compRows.offsetWidth; // reinicia a animação
    dom.compRows.style.animation = '';
    if (window.matchMedia('(max-width: 768px)').matches) {
      dom.compPanel.classList.add('open');
      dom.techPanel.classList.remove('open');
    }
  }

  // Cursor tecnológico + indicador INSPECT
  function setHover(comp, x, y) {
    const cur = dom.cursor;
    if (typeof x === 'number') {
      const r = dom.viewer.getBoundingClientRect();
      cur.style.transform = 'translate(' + (x - r.left) + 'px,' + (y - r.top) + 'px)';
      cur.classList.add('visible');
    }
    cur.classList.toggle('hot', !!comp);
    $('span', cur).textContent = comp ? 'INSPECT · ' + comp : 'INSPECT';
    $('#three-canvas').style.cursor = comp ? 'pointer' : 'crosshair';
  }

  // ==========================================
  // SCANNER — log do diagnóstico
  // ==========================================
  function runScan(done) {
    scanTimers.forEach(clearTimeout);
    scanTimers = [];
    dom.scanList.innerHTML = '';
    dom.scanDone.classList.remove('show');
    dom.scanPanel.hidden = false;

    const items = ['BODY', 'MOTORS', 'SENSORS', 'CAMERA', 'GIMBAL'];
    items.forEach(function (name, i) {
      scanTimers.push(setTimeout(function () {
        const li = document.createElement('li');
        const a = document.createElement('span');
        a.textContent = name + ' ' + '.'.repeat(Math.max(2, 12 - name.length));
        const b = document.createElement('b'); b.textContent = 'OK';
        li.appendChild(a); li.appendChild(b);
        dom.scanList.appendChild(li);
      }, 600 + i * 550));
    });
    scanTimers.push(setTimeout(function () { dom.scanDone.classList.add('show'); }, 600 + items.length * 550));
    scanTimers.push(setTimeout(function () {
      dom.scanPanel.hidden = true;
      if (done) done();
    }, 600 + items.length * 550 + 1800));
  }

  App.UI = {
    init: init,
    startBoot: startBoot,
    setModelSource: setModelSource,
    showFatal: showFatal,
    toast: toast,
    setButton: setButton,
    setViewActive: setViewActive,
    setMode: setMode,
    updateHUD: updateHUD,
    showComponent: showComponent,
    setHover: setHover,
    runScan: runScan
  };
})();
