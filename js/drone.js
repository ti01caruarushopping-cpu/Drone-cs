// ==========================================
// DRONE.JS — MODELO 3D (GLB real ou procedural)
// ==========================================
// Substitua models/mavic3.glb pelo modelo 3D real.
// Se o arquivo não existir, createFallbackDrone() gera um modelo provisório.
window.App = window.App || {};

(function () {
  'use strict';

  // ==========================================
  // INFORMAÇÕES DOS COMPONENTES (painel lateral)
  // Para adicionar um componente: inclua uma entrada aqui, um chip no index.html
  // e marque o objeto 3D com userData.component = 'NOME'.
  // ==========================================
  const COMPONENT_INFO = {
    BODY: { title: 'BODY', rows: [
      ['COMPONENT', 'Fuselage (top cover, vent module, bottom cover)'],
      ['QUANTITY', '1'], ['POSITION', 'CENTER'], ['STATUS', 'OPERATIONAL']] },
    ARM: { title: 'ARM', rows: [
      ['COMPONENT', 'Arm with cable harness'],
      ['QUANTITY', '4'], ['POSITION', 'BODY SIDES'], ['STATUS', 'OPERATIONAL']] },
    MOTOR: { title: 'MOTOR', rows: [
      ['COMPONENT', 'Brushless Motor'],
      ['QUANTITY', '4'], ['POSITION', 'ARM'], ['STATUS', 'OPERATIONAL']] },
    PROPELLER: { title: 'PROPELLER', rows: [
      ['COMPONENT', 'Propeller + retaining screw'],
      ['QUANTITY', '4'], ['POSITION', 'MOTOR'], ['STATUS', 'OPERATIONAL']] },
    CAMERA: { title: 'CAMERA', rows: [
      ['TYPE', 'Hasselblad'], ['SENSOR', '4/3 CMOS'], ['PHOTO', '20 MP'],
      ['VIDEO', '5.1K'], ['GIMBAL', '3 AXIS'], ['STATUS', 'OPERATIONAL']] },
    GIMBAL: { title: 'GIMBAL', rows: [
      ['COMPONENT', 'Gimbal and gimbal mount'],
      ['AXES', '3 AXIS'], ['POSITION', 'FRONT / BOTTOM'], ['STATUS', 'OPERATIONAL']] },
    SENSOR: { title: 'SENSOR', rows: [
      ['COMPONENT', 'Front obstacle sensors'],
      ['QUANTITY', '2'], ['POSITION', 'FRONT'], ['STATUS', 'OPERATIONAL']] },
    GPS: { title: 'GPS', rows: [
      ['COMPONENT', 'GNSS module'],
      ['GNSS', 'GPS / GLONASS / Galileo / BeiDou'], ['POSITION', 'BODY (TOP)'], ['STATUS', 'OPERATIONAL']] },
    MAINBOARD: { title: 'MAINBOARD', rows: [
      ['COMPONENT', 'Main board'],
      ['QUANTITY', '1'], ['POSITION', 'BODY (INTERNAL)'], ['STATUS', 'OPERATIONAL']] }
  };

  // ==========================================
  // MATERIAIS
  // ==========================================
  const MAT = {
    body:   { color: 0x2b3036, metalness: 0.55, roughness: 0.5 },
    dark:   { color: 0x15181c, metalness: 0.6,  roughness: 0.4 },
    metal:  { color: 0x9aa7b2, metalness: 0.9,  roughness: 0.3 },
    black:  { color: 0x08090b, metalness: 0.3,  roughness: 0.7 },
    glass:  { color: 0x050b12, metalness: 1.0,  roughness: 0.08 },
    orange: { color: 0xff7a1a, metalness: 0.2,  roughness: 0.5 },
    board:  { color: 0x0f3d2e, metalness: 0.4,  roughness: 0.5 },
    prop:   { color: 0x23272c, metalness: 0.3,  roughness: 0.55 },
    copper: { color: 0xb86a2a, metalness: 0.8,  roughness: 0.35 },
    led:    { color: 0x00d9ff, emissive: 0x00d9ff, emissiveIntensity: 1.2, metalness: 0, roughness: 0.4 }
  };

  // Cria um material independente (permite destacar cada peça separadamente)
  function mat(key) {
    return new THREE.MeshStandardMaterial(MAT[key]);
  }

  function mesh(geo, key, x, y, z) {
    const m = new THREE.Mesh(geo, mat(key));
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  // Caixa com cantos arredondados no plano XZ (w = X, d = Z, h = altura Y)
  function rbox(w, d, h, r, bevel) {
    const b = bevel || 0.03;
    const x = -w / 2, y = -d / 2;
    const s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(h - 2 * b, 0.001), bevelEnabled: true,
      bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 8
    });
    g.rotateX(-Math.PI / 2); // extrusão passa a crescer em +Y
    g.center();
    return g;
  }

  // Nó (grupo) que representa uma peça selecionável
  function node(name, component) {
    const g = new THREE.Group();
    g.name = name;
    if (component) g.userData.component = component;
    return g;
  }

  // Registra posição original e deslocamento da vista explodida
  function ex(n, offset) {
    n.userData.home = n.position.clone();
    n.userData.offset = new THREE.Vector3(offset[0], offset[1], offset[2]);
    return n;
  }

  // ==========================================
  // CORPO
  // ==========================================
  function createDroneBody() {
    const body = new THREE.Group();
    body.name = 'BODY_ASSEMBLY';

    // Corpo principal
    const core = node('core', 'BODY');
    core.add(mesh(rbox(0.95, 2.0, 0.42, 0.3, 0.03), 'body'));
    [-1, 1].forEach(function (s) {
      core.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 1.4), 'metal', s * 0.48, 0, -0.1));
    });
    core.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), 'led', 0, 0.02, -1.0)); // LED traseiro
    body.add(core);

    // Tampa superior + antenas
    const top = node('topCover', 'BODY');
    top.position.set(0, 0.3, 0);
    top.add(mesh(rbox(0.86, 1.85, 0.2, 0.3, 0.03), 'body'));
    [-1, 1].forEach(function (s) {
      const a = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.3, 8), 'black', s * 0.32, 0.2, -0.8);
      a.rotation.z = -s * 0.3;
      a.rotation.x = -0.25;
      top.add(a);
    });
    ex(top, [0, 1.0, 0]);
    body.add(top);

    // Módulo de ventilação (topo)
    const vent = node('vent', 'BODY');
    vent.position.set(0, 0.43, -0.62);
    vent.add(mesh(rbox(0.5, 0.34, 0.05, 0.05, 0.01), 'dark'));
    for (let i = 0; i < 6; i++) {
      vent.add(mesh(new THREE.BoxGeometry(0.42, 0.012, 0.014), 'black', 0, 0.03, -0.12 + i * 0.048));
    }
    ex(vent, [0, 1.7, -0.2]);
    body.add(vent);

    // Tampa inferior + ventilação
    const bottom = node('bottomCover', 'BODY');
    bottom.position.set(0, -0.3, 0);
    bottom.add(mesh(rbox(0.82, 1.7, 0.2, 0.3, 0.03), 'body'));
    for (let i = 0; i < 8; i++) {
      bottom.add(mesh(new THREE.BoxGeometry(0.4, 0.01, 0.03), 'black', 0, -0.105, -0.5 + i * 0.075));
    }
    ex(bottom, [0, -1.3, 0]);
    body.add(bottom);

    // Módulo GPS
    const gps = node('gps', 'GPS');
    gps.position.set(0, 0.43, 0.2);
    gps.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 24), 'dark'));
    gps.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 24), 'metal', 0, 0.04, 0));
    ex(gps, [0, 1.4, 0.3]);
    body.add(gps);

    // Placa principal (interna — visível na vista explodida)
    const mb = node('mainboard', 'MAINBOARD');
    mb.position.set(0, 0.05, 0.05);
    mb.add(mesh(new THREE.BoxGeometry(0.7, 0.03, 1.2), 'board'));
    mb.add(mesh(new THREE.BoxGeometry(0.3, 0.04, 0.3), 'metal', 0, 0.035, -0.2));
    const chips = [[-0.2, 0.3], [0.15, 0.35], [-0.15, 0.0], [0.2, 0.0], [0.0, 0.5], [-0.25, -0.4], [0.25, -0.45], [0.0, -0.55]];
    chips.forEach(function (c) {
      mb.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.1), 'black', c[0], 0.03, c[1]));
    });
    ex(mb, [0, 0.95, 0]);
    body.add(mb);

    return body;
  }

  // ==========================================
  // MOTOR
  // ==========================================
  function createMotor() {
    const m = node('motor', 'MOTOR');
    m.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 24), 'dark'));
    m.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 24), 'black', 0, 0.12, 0));
    m.add(mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.03, 24), 'copper', 0, 0.03, 0));
    m.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 12), 'metal', 0, 0.2, 0));
    m.add(mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), 'orange', 0.12, 0.175, 0)); // marca visível ao girar
    m.userData.spin = true;
    return m;
  }

  // ==========================================
  // HÉLICE — quatro elementos independentes: cubo, 2 pás, parafuso
  // ==========================================
  function createPropeller() {
    const p = node('propeller', 'PROPELLER');
    p.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), 'dark'));
    [-1, 1].forEach(function (s) {
      const blade = mesh(rbox(0.74, 0.1, 0.016, 0.045, 0.004), 'prop', s * 0.41, 0.02, 0);
      blade.rotation.x = s * 0.15;
      const tip = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.09), 'orange', s * 0.36, 0, 0);
      blade.add(tip);
      p.add(blade);
    });
    p.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), 'metal', 0, 0.05, 0));
    p.userData.isProp = true;
    return p;
  }

  // ==========================================
  // BRAÇO (com motor, hélice e perna de pouso)
  // ==========================================
  function createDroneArm(name, hub, tip) {
    const dx = tip.x - hub.x, dz = tip.z - hub.z;
    const L = Math.hypot(dx, dz);

    const arm = node(name, 'ARM');
    arm.position.set(hub.x, hub.y, hub.z);
    arm.rotation.y = Math.atan2(dx, dz); // +Z local aponta para a ponta do braço

    arm.add(mesh(rbox(0.15, L + 0.1, 0.12, 0.05, 0.015), 'body', 0, 0, L / 2));
    arm.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 16), 'metal', 0, 0, 0.02)); // dobradiça

    // Cabos do braço
    [0xff3b30, 0xffcc00, 0x34c759, 0x007aff].forEach(function (c, i) {
      const cable = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), 'black', -0.03 + i * 0.02, 0.07, 0.25);
      cable.rotation.x = Math.PI / 2;
      cable.material.color.setHex(c);
      arm.add(cable);
    });

    // Perna de pouso e suporte do motor
    arm.add(mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), 'dark', 0, -0.32, L));
    arm.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.14), 'black', 0, -0.6, L));
    arm.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 24), 'dark', 0, 0.05, L));

    const motor = createMotor();
    motor.position.set(0, 0.17, L);
    ex(motor, [0, 0.7, 0]);
    arm.add(motor);

    const prop = createPropeller();
    prop.position.set(0, 0.36, L);
    ex(prop, [0, 1.3, 0]);
    arm.add(prop);

    ex(arm, [0, 0, 0.45]); // afasta o braço para fora
    return arm;
  }

  // ==========================================
  // CÂMERA (Hasselblad) e GIMBAL
  // ==========================================
  const GIMBAL_POS = new THREE.Vector3(0, -0.5, 1.02);

  function createCamera() {
    const cam = node('camera', 'CAMERA');
    cam.position.copy(GIMBAL_POS);
    cam.add(mesh(rbox(0.44, 0.42, 0.38, 0.12, 0.02), 'dark'));
    // Lente principal (wide)
    const wide = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 28), 'black', -0.1, 0.04, 0.22);
    wide.rotation.x = Math.PI / 2;
    cam.add(wide);
    const wideGlass = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 28), 'glass', -0.1, 0.04, 0.285);
    wideGlass.rotation.x = Math.PI / 2;
    cam.add(wideGlass);
    // Lente tele
    const tele = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 24), 'black', 0.14, -0.04, 0.2);
    tele.rotation.x = Math.PI / 2;
    cam.add(tele);
    const teleGlass = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24), 'glass', 0.14, -0.04, 0.255);
    teleGlass.rotation.x = Math.PI / 2;
    cam.add(teleGlass);
    // Sensor auxiliar
    const aux = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16), 'metal', 0.12, 0.12, 0.2);
    aux.rotation.x = Math.PI / 2;
    cam.add(aux);
    // Dissipador no topo
    for (let i = 0; i < 5; i++) {
      cam.add(mesh(new THREE.BoxGeometry(0.3, 0.012, 0.02), 'metal', 0, 0.2, -0.12 + i * 0.05));
    }
    ex(cam, [0, -1.1, 0.5]);
    return cam;
  }

  function createGimbal() {
    const gimbal = node('gimbal', 'GIMBAL');
    gimbal.position.copy(GIMBAL_POS);
    [-1, 1].forEach(function (s) {
      gimbal.add(mesh(new THREE.BoxGeometry(0.05, 0.46, 0.12), 'dark', s * 0.27, 0.03, 0));
      const m = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 20), 'metal', s * 0.31, 0.06, 0);
      m.rotation.z = Math.PI / 2;
      gimbal.add(m);
    });
    gimbal.add(mesh(new THREE.BoxGeometry(0.6, 0.05, 0.1), 'dark', 0, 0.25, -0.05));
    ex(gimbal, [0, -0.6, 0.2]);

    // Suporte do gimbal (placa de fixação)
    const mount = node('gimbalMount', 'GIMBAL');
    mount.position.set(0, -0.4, 0.9);
    mount.add(mesh(rbox(0.5, 0.42, 0.05, 0.08, 0.01), 'dark'));
    [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]].forEach(function (p) {
      mount.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10), 'metal', p[0], -0.01, p[1]));
    });
    ex(mount, [0, -0.3, 0.1]);
    return { gimbal: gimbal, mount: mount };
  }

  // Sensores frontais de obstáculos
  function createSensors() {
    const list = [];
    [-1, 1].forEach(function (s) {
      const sn = node(s < 0 ? 'sensorL' : 'sensorR', 'SENSOR');
      sn.position.set(s * 0.33, 0.0, 0.97);
      const c = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 24), 'black');
      c.rotation.x = Math.PI / 2;
      sn.add(c);
      const g = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24), 'glass', 0, 0, 0.055);
      g.rotation.x = Math.PI / 2;
      sn.add(g);
      sn.add(mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), 'metal', 0, 0, 0.05));
      ex(sn, [s * 0.35, 0, 0.75]);
      list.push(sn);
    });
    return list;
  }

  // ==========================================
  // DRONE PROVISÓRIO (fallback procedural)
  // ==========================================
  function createFallbackDrone() {
    const root = new THREE.Group();
    root.name = 'MAVIC3_FALLBACK';

    root.add(createDroneBody());
    createSensors().forEach(function (s) { root.add(s); });
    root.add(createCamera());
    const gm = createGimbal();
    root.add(gm.gimbal);
    root.add(gm.mount);

    // Quatro braços: [nome, posição do eixo no corpo, posição do motor]
    const arms = [
      ['armFL', new THREE.Vector3(-0.45, 0, 0.5),  new THREE.Vector3(-1.3, 0, 0.9)],
      ['armFR', new THREE.Vector3(0.45, 0, 0.5),   new THREE.Vector3(1.3, 0, 0.9)],
      ['armRL', new THREE.Vector3(-0.45, 0, -0.5), new THREE.Vector3(-1.3, 0, -0.85)],
      ['armRR', new THREE.Vector3(0.45, 0, -0.5),  new THREE.Vector3(1.3, 0, -0.85)]
    ];
    arms.forEach(function (a) { root.add(createDroneArm(a[0], a[1], a[2])); });

    finalize(root);
    return root;
  }

  // Coleta listas auxiliares e cria as linhas de contorno (modo técnico)
  function finalize(root) {
    const u = root.userData;
    u.explodables = [];
    u.props = [];
    u.motors = [];
    u.explodeT = 0;
    u.explodeTarget = 0;
    root.traverse(function (o) {
      if (o.userData && o.userData.offset) u.explodables.push(o);
      if (o.userData && o.userData.isProp) u.props.push(o);
      if (o.userData && o.userData.spin) u.motors.push(o);
    });
    root.userData.edges = null; // criados na primeira vez que o TECH é ativado (modelos grandes)
  }

  function addEdges(root) {
    const meshes = [];
    root.traverse(function (o) { if (o.isMesh) meshes.push(o); });
    root.userData.edges = [];
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.55 });
    meshes.forEach(function (m) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edgeMat);
      e.visible = false;
      e.raycast = function () {}; // linhas não participam da seleção
      e.userData.isEdge = true;
      m.add(e);
      root.userData.edges.push(e);
    });
  }

  // ==========================================
  // MODELO GLB REAL
  // ==========================================
  // Associa nomes de objetos do GLB aos componentes. Ajuste conforme os nomes do seu modelo.
  const GLB_MAP = [
    [/prop|rotor|blade|h[eé]lice/i, 'PROPELLER'],
    [/motor/i, 'MOTOR'],
    [/gimbal/i, 'GIMBAL'],
    [/cam|lens|hasselblad/i, 'CAMERA'],
    [/sensor|obstacle/i, 'SENSOR'],
    [/gps|gnss/i, 'GPS'],
    [/board|pcb|main/i, 'MAINBOARD'],
    [/arm|bra[cç]o/i, 'ARM']
  ];
  // Deslocamento da vista explodida por componente (em unidades do mundo)
  const GLB_EXPLODE = {
    PROPELLER: [0, 2.0, 0], MOTOR: [0, 1.2, 0], CAMERA: [0, -1.1, 0.5], GIMBAL: [0, -0.7, 0.2],
    SENSOR: [0, 0, 0.7], GPS: [0, 1.4, 0], MAINBOARD: [0, 0.95, 0], BODY: 'vertical', ARM: 'radial'
  };

  function guessComponent(obj) {
    let o = obj;
    while (o) {
      for (let i = 0; i < GLB_MAP.length; i++) {
        if (o.name && GLB_MAP[i][0].test(o.name)) return GLB_MAP[i][1];
      }
      o = o.parent;
    }
    return 'BODY';
  }

  function prepareGLB(scene) {
    const root = new THREE.Group();
    root.name = 'MAVIC3_GLB';
    root.add(scene);

    // Normaliza escala e centraliza (maior dimensão ≈ 4 unidades)
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const k = 4 / Math.max(size.x, size.y, size.z, 0.0001);
    scene.scale.multiplyScalar(k);
    const box2 = new THREE.Box3().setFromObject(scene);
    scene.position.sub(box2.getCenter(new THREE.Vector3()));
    root.updateMatrixWorld(true);

    const meshes = [];
    scene.traverse(function (o) {
      if (o.isMesh) meshes.push(o);
      // Nó-grupo com origem no cubo da hélice: gira no modo DEMO
      else if (o.name && /^PROPELLER/i.test(o.name)) o.userData.isProp = true;
    });
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    meshes.forEach(function (m) {
      if (Array.isArray(m.material)) m.material = m.material.map(function (x) { return x.clone(); });
      else m.material = m.material.clone();
      const comp = guessComponent(m);
      m.userData.component = comp;

      // Deslocamento no espaço do mundo, convertido para o espaço local do pai
      let off = GLB_EXPLODE[comp];
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      if (off === 'radial') off = [c.x * 0.5, 0, c.z * 0.5];   // braços: para fora
      else if (off === 'vertical') off = [0, c.y * 1.2, 0];    // corpo: partes de cima sobem, de baixo descem
      else if (!off) off = [0, 0, 0];
      const v = new THREE.Vector3(off[0], off[1], off[2]);
      if (m.parent) {
        m.parent.getWorldQuaternion(wq);
        m.parent.getWorldScale(ws);
        v.applyQuaternion(wq.invert()).divide(ws);
      }
      m.userData.home = m.position.clone();
      m.userData.offset = v;
    });

    finalize(root);
    return root;
  }

  // ==========================================
  // CARREGAMENTO — tenta o GLB; se falhar, usa o modelo provisório
  // ==========================================
  // Alternativa para abrir index.html direto do disco (file://): o navegador bloqueia
  // a leitura do .glb, então carregamos models/mavic3.glb.js (GLB em base64).
  // Gere/atualize com: python tools/glb-to-js.py
  function loadEmbedded(url, loader) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = url.replace(/\.glb$/i, '.glb.js');
      s.onload = function () {
        try {
          const bin = atob(window.MAVIC3_GLB_BASE64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          loader.parse(bytes.buffer, '', resolve, reject);
        } catch (e) { reject(e); }
      };
      s.onerror = function () { reject(new Error('models/mavic3.glb.js não encontrado')); };
      document.head.appendChild(s);
    });
  }

  function loadDroneModel(url) {
    return new Promise(function (resolve) {
      function fallback(reason) {
        console.warn('GLB MODEL NOT FOUND — usando modelo provisório.', reason || '');
        let root;
        try { root = createFallbackDrone(); } catch (e) { console.error(e); root = new THREE.Group(); }
        resolve({ root: root, source: 'fallback', reason: String(reason && reason.message || reason || '') });
      }
      function accept(gltf) {
        try { resolve({ root: prepareGLB(gltf.scene), source: 'glb' }); }
        catch (e) { fallback(e); }
      }
      if (!THREE.GLTFLoader) { fallback('GLTFLoader indisponível'); return; }
      try {
        const loader = new THREE.GLTFLoader();
        loader.load(url, accept, undefined, function (err) {
          console.warn('Leitura direta do GLB falhou (normal em file://):', err);
          loadEmbedded(url, loader).then(accept).catch(fallback);
        });
      } catch (e) { fallback(e); }
    });
  }

  // ==========================================
  // EXPLOSÃO
  // ==========================================
  function explodeDrone(root) { if (root) root.userData.explodeTarget = 1; }
  function resetExplosion(root) { if (root) root.userData.explodeTarget = 0; }

  function applyExplosion(root) {
    const t = root.userData.explodeT;
    const e = t * t * (3 - 2 * t); // smoothstep
    root.userData.explodables.forEach(function (n) {
      n.position.copy(n.userData.home).addScaledVector(n.userData.offset, e);
    });
  }

  // ==========================================
  // ATUALIZAÇÃO POR FRAME
  // ==========================================
  function updateDrone(root, dt, st) {
    if (!root || !root.userData.explodables) return;
    const u = root.userData;

    // Animação suave da vista explodida (independente do FPS)
    if (u.explodeT !== u.explodeTarget) {
      u.explodeT += (u.explodeTarget - u.explodeT) * Math.min(1, dt * 4.5);
      if (Math.abs(u.explodeTarget - u.explodeT) < 0.001) u.explodeT = u.explodeTarget;
      applyExplosion(root);
    }

    // Modo demonstração: motores e hélices giram
    if (st && st.demo) {
      u.props.forEach(function (p, i) { p.rotation.y += dt * 20 * (i % 2 ? 1 : -1); });
      u.motors.forEach(function (m, i) { m.rotation.y += dt * 20 * (i % 2 ? 1 : -1); });
    }
  }

  // ==========================================
  // DESTAQUE / SELEÇÃO / MODOS DE MATERIAL
  // ==========================================
  function ownerOf(o) {
    while (o) {
      if (o.userData && o.userData.component) return o;
      o = o.parent;
    }
    return null;
  }

  function componentOf(o) {
    if (o.userData.comp !== undefined) return o.userData.comp;
    const n = ownerOf(o);
    o.userData.comp = n ? n.userData.component : null;
    return o.userData.comp;
  }

  function matList(m) { return Array.isArray(m.material) ? m.material : [m.material]; }

  // hover = componente sob o cursor (ciano); selected = componente aberto no painel (verde)
  function setHighlight(root, hover, selected) {
    if (!root) return;
    root.traverse(function (m) {
      if (!m.isMesh) return;
      const c = componentOf(m);
      matList(m).forEach(function (mt) {
        if (!mt.emissive) return;
        if (!mt.userData.base) mt.userData.base = { e: mt.emissive.clone(), i: mt.emissiveIntensity };
        if (c && c === hover) { mt.emissive.setHex(0x00d9ff); mt.emissiveIntensity = 0.6; }
        else if (c && c === selected) { mt.emissive.setHex(0x00ff9c); mt.emissiveIntensity = 0.4; }
        else { mt.emissive.copy(mt.userData.base.e); mt.emissiveIntensity = mt.userData.base.i; }
      });
    });
  }

  // Wireframe total (WIRE) ou parcial (TECH: braços, motores, hélices; corpo translúcido)
  const TECH_WIRE = { ARM: 1, MOTOR: 1, PROPELLER: 1 };
  function applyMaterialModes(root, opt) {
    if (!root) return;
    root.traverse(function (m) {
      if (!m.isMesh) return;
      const c = componentOf(m);
      const partial = opt.tech && TECH_WIRE[c];
      const ghost = opt.tech && c === 'BODY';
      matList(m).forEach(function (mt) {
        mt.wireframe = !!(opt.wire || partial);
        mt.transparent = ghost ? true : false;
        mt.opacity = ghost ? 0.4 : 1;
        mt.depthWrite = !ghost;
        mt.needsUpdate = true;
      });
    });
    if (opt.tech && !root.userData.edges) addEdges(root);
    if (root.userData.edges) {
      root.userData.edges.forEach(function (e) { e.visible = !!opt.tech; });
    }
  }

  App.Drone = {
    COMPONENT_INFO: COMPONENT_INFO,
    loadDroneModel: loadDroneModel,
    createFallbackDrone: createFallbackDrone,
    createDroneBody: createDroneBody,
    createDroneArm: createDroneArm,
    createMotor: createMotor,
    createPropeller: createPropeller,
    createCamera: createCamera,
    createGimbal: createGimbal,
    explodeDrone: explodeDrone,
    resetExplosion: resetExplosion,
    updateDrone: updateDrone,
    setHighlight: setHighlight,
    applyMaterialModes: applyMaterialModes,
    componentOf: componentOf
  };
})();
