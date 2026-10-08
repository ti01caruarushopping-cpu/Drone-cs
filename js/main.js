// ==========================================
// MAIN.JS — CENA, CÂMERA, RENDERER, LUZES E LOOP
// ==========================================
window.App = window.App || {};

(function () {
  'use strict';

  // ==========================================
  // CONFIGURAÇÃO GERAL (altere aqui velocidade, limites, cores)
  // ==========================================
  const CONFIG = App.CONFIG = {
    modelUrl: 'models/mavic3.glb',          // Substitua models/mavic3.glb pelo modelo 3D real
    autoRotateSpeed: 0.12,                  // rad/s (0.12 ≈ 7°/s). Aumente para girar mais rápido
    camera: { fov: 45, near: 0.1, far: 1000, start: [4, 2.5, 5] },
    minDistance: 3,
    maxDistance: 15,
    maxPixelRatio: 2,
    gridY: -0.95,
    scanDuration: 3.5,                      // segundos
    bootDuration: 2000,                     // ms da tela de inicialização
    colors: { background: 0x05070A, techBackground: 0x020304, accent: 0x00D9FF, accent2: 0x00FF9C, grid: 0x1D3545 }
  };

  const state = App.state = {
    auto: false, explode: false, scan: false, wire: false,
    tech: false, light: true, axis: false, demo: false
  };

  let renderer, scene, camera, controls, clock;
  let drone = null;
  let grid, polar, stars, stars2, axes, axesGroup, techGroup, scanner, floorGlow;
  const lights = {};
  const scan = { active: false, t: 0 };
  let hoverComp = null, selectedComp = null;
  const ptr = { x: 0, y: 0, dirty: false, down: null, pressed: false };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let canvas, viewerEl;

  // fps / HUD
  let frames = 0, fpsAcc = 0, fps = 60, hudAcc = 0, lowFpsCount = 0;

  // ==========================================
  // DETECÇÃO DE WEBGL
  // ==========================================
  function webglOK() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================
  function init() {
    App.UI.init();

    if (typeof THREE === 'undefined' || !THREE.OrbitControls) {
      App.UI.showFatal('FAILED TO LOAD THREE.JS FROM CDN.\nCheck your internet connection and reload the page.');
      return;
    }
    if (!webglOK()) {
      App.UI.showFatal('WEBGL NOT SUPPORTED.\nEnable hardware acceleration or try another browser.');
      return;
    }

    try {
      setupScene();
    } catch (e) {
      console.error(e);
      App.UI.showFatal('WEBGL ERROR.\n' + (e && e.message ? e.message : e));
      return;
    }

    // Carrega o drone (GLB ou provisório) e controla a tela de inicialização
    const ready = App.Drone.loadDroneModel(CONFIG.modelUrl).then(function (res) {
      drone = res.root;
      scene.add(drone);
      App.UI.setModelSource(res.source);
      buildTechHelpers();
      if (res.source === 'fallback') {
        setTimeout(function () { App.UI.toast('GLB MODEL NOT FOUND — PROCEDURAL MODEL LOADED', 4500); }, 2500);
      }
    });
    App.UI.startBoot(ready);

    setupPicking();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 250); });
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(viewerEl);
    onResize();

    App.onEnter = function () {
      onResize();
      // Scanner ocasional
      setTimeout(function () { App.actions.scan(); }, 1800);
      setInterval(function () {
        if (!state.scan && document.visibilityState === 'visible') App.actions.scan();
      }, 45000);
    };

    clock = new THREE.Clock();
    animate();
  }

  // ==========================================
  // CONFIGURAÇÃO DA CENA THREE.JS
  // ==========================================
  function setupScene() {
    canvas = document.getElementById('three-canvas');
    viewerEl = document.getElementById('viewer');

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      App.UI.toast('WEBGL CONTEXT LOST — RESTORING...', 5000);
    });
    canvas.addEventListener('webglcontextrestored', function () {
      App.UI.toast('WEBGL CONTEXT RESTORED', 2500);
    });

    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.background);
    scene.fog = new THREE.Fog(CONFIG.colors.background, 14, 40);

    // Câmera: FOV 45, posição inicial (4, 2.5, 5) olhando para o centro
    camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, CONFIG.camera.near, CONFIG.camera.far);
    camera.position.fromArray(CONFIG.camera.start);

    controls = App.Controls.initControls(camera, canvas);

    buildEnvironment();
    buildLights();
    buildBackground();
    buildScanner();
    buildAxes();
  }

  // Ambiente procedural (reflexos metálicos) — não depende de arquivos externos
  function buildEnvironment() {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#1a2a38'); gr.addColorStop(0.5, '#0c141c'); gr.addColorStop(1, '#04070a');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));

    function panel(w, h, pos, color, k) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(0, 0, 0);
      env.add(m);
    }
    panel(30, 10, [0, 30, 10], 0xffffff, 3);
    panel(10, 30, [-30, 5, 10], 0xbfe9ff, 2);
    panel(10, 30, [30, 5, -10], 0x00d9ff, 2.5);
    panel(20, 6, [0, -2, -35], 0x00d9ff, 1.5);

    scene.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }

  // Iluminação cinematográfica
  function buildLights() {
    lights.ambient = new THREE.AmbientLight(0x6688aa, 0.25);
    lights.hemi = new THREE.HemisphereLight(0x88aacc, 0x0a0f14, 0.5);

    lights.key = new THREE.DirectionalLight(0xffffff, 1.2);   // luz branca frontal
    lights.key.position.set(0, 3, 6);

    lights.side = new THREE.DirectionalLight(0xaad8ff, 0.6);  // luz lateral
    lights.side.position.set(6, 2, 0);

    lights.rim = new THREE.PointLight(0x00d9ff, 2.2, 15);     // contorno ciano atrás do drone
    lights.rim.position.set(0, 1.5, -4);

    Object.keys(lights).forEach(function (k) {
      lights[k].userData.base = lights[k].intensity;
      scene.add(lights[k]);
    });
  }

  // Fundo: grid em perspectiva, grid polar, estrelas, brilho no chão
  function buildBackground() {
    grid = new THREE.GridHelper(24, 48, CONFIG.colors.accent, CONFIG.colors.grid);
    grid.position.y = CONFIG.gridY;
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    scene.add(grid);

    polar = new THREE.PolarGridHelper(7, 12, 7, 96, CONFIG.colors.accent, CONFIG.colors.grid);
    polar.position.y = CONFIG.gridY + 0.001;
    polar.material.transparent = true;
    polar.material.opacity = 0.25;
    scene.add(polar);

    // Brilho suave sob o drone
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,217,255,0.35)'); rg.addColorStop(1, 'rgba(0,217,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = CONFIG.gridY + 0.002;
    scene.add(floorGlow);

    // Pontos luminosos (duas camadas para cintilação)
    function makeStars(n, size, opacity) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 18 + Math.random() * 40;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph);
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x88ccff, size: size, transparent: true, opacity: opacity, depthWrite: false, fog: false }));
      scene.add(pts);
      return pts;
    }
    stars = makeStars(500, 0.12, 0.7);
    stars2 = makeStars(120, 0.2, 0.9);
  }

  // Plano luminoso do scanner
  function buildScanner() {
    scanner = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 4),
      new THREE.MeshBasicMaterial({ color: CONFIG.colors.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    plane.rotation.x = -Math.PI / 2;
    const pts = [new THREE.Vector3(-2.5, 0, -2), new THREE.Vector3(2.5, 0, -2), new THREE.Vector3(2.5, 0, 2), new THREE.Vector3(-2.5, 0, 2)];
    const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: CONFIG.colors.accent, transparent: true, opacity: 0.95 }));
    scanner.add(plane); scanner.add(frame);
    scanner.visible = false;
    scene.add(scanner);
  }

  function makeLabel(text, color, scale) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 34px monospace';
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 32);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(scale * 4, scale, 1);
    return s;
  }

  // Eixos 3D (botão AXIS) — desligados por padrão
  function buildAxes() {
    axesGroup = new THREE.Group();
    axes = new THREE.AxesHelper(2.6);
    axesGroup.add(axes);
    const lx = makeLabel('X', '#ff5c5c', 0.3); lx.position.set(2.9, 0, 0);
    const ly = makeLabel('Y', '#00ff9c', 0.3); ly.position.set(0, 2.9, 0);
    const lz = makeLabel('Z', '#00d9ff', 0.3); lz.position.set(0, 0, 2.9);
    axesGroup.add(lx, ly, lz);
    axesGroup.visible = false;
    scene.add(axesGroup);
  }

  // Caixa de referência e cotas do modo técnico
  function buildTechHelpers() {
    techGroup = new THREE.Group();
    const box = new THREE.Box3().setFromObject(drone);
    techGroup.add(new THREE.Box3Helper(box, 0x00d9ff));
    const c = box.getCenter(new THREE.Vector3());
    const lw = makeLabel('347 mm', '#ffb000', 0.28); lw.position.set(c.x, box.min.y - 0.15, box.max.z + 0.3);
    const ll = makeLabel('283 mm', '#ffb000', 0.28); ll.position.set(box.max.x + 0.5, box.min.y - 0.15, c.z);
    const lh = makeLabel('107 mm', '#ffb000', 0.28); lh.position.set(box.max.x + 0.3, c.y, box.max.z + 0.3);
    techGroup.add(lw, ll, lh);
    techGroup.visible = state.tech;
    scene.add(techGroup);
  }

  // ==========================================
  // RESIZE
  // ==========================================
  function onResize() {
    if (!renderer || !viewerEl) return;
    const w = viewerEl.clientWidth, h = viewerEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Em telas estreitas (retrato) aumenta o FOV para o drone caber na largura
    camera.fov = camera.aspect < 1 ? Math.min(85, CONFIG.camera.fov + (1 - camera.aspect) * 80) : CONFIG.camera.fov;
    camera.updateProjectionMatrix();
  }

  // ==========================================
  // SELEÇÃO / HOVER DE COMPONENTES
  // ==========================================
  function pick(clientX, clientY) {
    if (!drone) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(drone, true);
    for (let i = 0; i < hits.length; i++) {
      if (hits[i].object.isMesh) return App.Drone.componentOf(hits[i].object);
    }
    return null;
  }

  function setupPicking() {
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      ptr.x = e.clientX; ptr.y = e.clientY;
      ptr.dirty = !ptr.pressed; // sem hover durante o arrasto
      App.UI.setHover(hoverComp, e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerdown', function (e) {
      ptr.pressed = true;
      ptr.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    window.addEventListener('pointerup', function (e) {
      ptr.pressed = false;
      const d = ptr.down; ptr.down = null;
      if (!d || e.target !== canvas) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved > 6 || performance.now() - d.t > 600) return; // foi arrasto, não clique
      App.actions.select(pick(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerleave', function () {
      if (hoverComp) { hoverComp = null; refreshHighlight(); }
    });
  }

  function refreshHighlight() {
    App.Drone.setHighlight(drone, hoverComp, selectedComp);
  }

  // ==========================================
  // AÇÕES (ligadas aos botões em interface.js)
  // ==========================================
  function applyModes() {
    App.Drone.applyMaterialModes(drone, { wire: state.wire, tech: state.tech });
  }

  function startScan() {
    state.scan = true;
    scan.active = true;
    scan.t = 0;
    scanner.visible = true;
    App.UI.setButton('scan', true);
    App.UI.runScan(function () {
      state.scan = false;
      App.UI.setButton('scan', false);
    });
  }

  const actions = App.actions = {
    auto: function () {
      state.auto = !state.auto;
      App.Controls.setAuto(state.auto);
      App.UI.setButton('auto', state.auto);
    },
    reset: function () { App.Controls.goPreset('home', drone); App.UI.setViewActive('reset'); },
    front: function () { App.Controls.goPreset('front', drone); App.UI.setViewActive('front'); },
    rear: function () { App.Controls.goPreset('rear', drone); App.UI.setViewActive('rear'); },
    top: function () { App.Controls.goPreset('top', drone); App.UI.setViewActive('top'); },
    bottom: function () { App.Controls.goPreset('bottom', drone); App.UI.setViewActive('bottom'); },
    explode: function () {
      state.explode = !state.explode;
      if (state.explode) App.Drone.explodeDrone(drone); else App.Drone.resetExplosion(drone);
      App.UI.setButton('explode', state.explode);
    },
    scan: function () { if (!state.scan && drone) startScan(); },
    wire: function () {
      state.wire = !state.wire;
      applyModes();
      App.UI.setButton('wire', state.wire);
    },
    tech: function () {
      state.tech = !state.tech;
      applyModes();
      scene.background.setHex(state.tech ? CONFIG.colors.techBackground : CONFIG.colors.background);
      scene.fog.color.setHex(state.tech ? CONFIG.colors.techBackground : CONFIG.colors.background);
      grid.material.opacity = state.tech ? 0.8 : 0.3;
      polar.material.opacity = state.tech ? 0.55 : 0.25;
      if (techGroup) techGroup.visible = state.tech;
      axesGroup.visible = state.tech || state.axis;
      App.UI.setMode(state.tech);
      App.UI.setButton('tech', state.tech);
    },
    light: function () {
      state.light = !state.light;
      ['key', 'side', 'rim', 'hemi'].forEach(function (k) {
        lights[k].intensity = lights[k].userData.base * (state.light ? 1 : 0.12);
      });
      App.UI.setButton('light', state.light);
    },
    axis: function () {
      state.axis = !state.axis;
      axesGroup.visible = state.axis || state.tech;
      App.UI.setButton('axis', state.axis);
    },
    demo: function () {
      state.demo = !state.demo;
      App.UI.setButton('demo', state.demo);
    },
    select: function (comp) {
      selectedComp = comp || null;
      App.UI.showComponent(selectedComp);
      refreshHighlight();
    }
  };

  // ==========================================
  // LOOP DE ANIMAÇÃO
  // ==========================================
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    // FPS e ajuste automático de pixel ratio
    frames++; fpsAcc += dt;
    if (fpsAcc >= 0.5) {
      fps = Math.round(frames / fpsAcc);
      frames = 0; fpsAcc = 0;
      lowFpsCount = fps < 28 ? lowFpsCount + 1 : 0;
      if (lowFpsCount >= 6 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25));
        onResize();
        lowFpsCount = 0;
      }
    }

    App.Controls.update(dt, drone);
    if (drone) App.Drone.updateDrone(drone, dt, state);

    // Fundo
    stars.rotation.y += dt * 0.004;
    stars2.rotation.y += dt * 0.006;
    stars2.material.opacity = 0.55 + Math.sin(t * 1.6) * 0.35;

    // Scanner: sobe e desce uma vez
    if (scan.active) {
      scan.t += dt / CONFIG.scanDuration;
      const k = Math.min(scan.t, 1);
      const p = k < 0.5 ? k * 2 : 2 - k * 2;
      const e = p * p * (3 - 2 * p);
      scanner.position.y = CONFIG.gridY + 0.05 + e * 1.8;
      scanner.children[0].material.opacity = 0.12 * Math.sin(Math.PI * k) + 0.03;
      if (k >= 1) { scan.active = false; scanner.visible = false; }
    }

    // Hover (no máximo uma varredura de raio por frame)
    if (ptr.dirty) {
      ptr.dirty = false;
      const c = pick(ptr.x, ptr.y);
      if (c !== hoverComp) {
        hoverComp = c;
        refreshHighlight();
        App.UI.setHover(hoverComp);
      }
    }

    // HUD (10×/s)
    hudAcc += dt;
    if (hudAcc >= 0.1) {
      hudAcc = 0;
      const a = App.Controls.getAngles(drone);
      App.UI.updateHUD({
        yaw: a.yaw, pitch: a.pitch, roll: a.roll,
        pos: [camera.position.x, camera.position.y, camera.position.z],
        fps: fps, camQuat: camera.quaternion
      });
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
