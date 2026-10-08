// ==========================================
// CONTROLS.JS — ÓRBITA, PRESETS DE CÂMERA E AUTO ROTATE
// ==========================================
window.App = window.App || {};

(function () {
  'use strict';

  // Posições de câmera para cada vista (o drone aponta a frente para +Z)
  const PRESETS = {
    front:  [0, 0.7, 7.5],
    rear:   [0, 0.7, -7.5],
    top:    [0, 8, 0.6],
    bottom: [0, -8, 0.6]
  };

  let controls = null;
  let camera = null;
  let tween = null;
  let autoRotate = false;
  let userActive = false;

  // ==========================================
  // CONFIGURAÇÃO DO ORBITCONTROLS
  // ==========================================
  function initControls(cam, domElement) {
    const C = App.CONFIG;
    camera = cam;
    controls = new THREE.OrbitControls(cam, domElement);

    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.6;
    controls.minDistance = C.minDistance;
    controls.maxDistance = C.maxDistance;
    controls.minPolarAngle = 0.02;               // permite vista superior
    controls.maxPolarAngle = Math.PI - 0.02;     // permite vista inferior
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 0);

    // Mouse: esquerdo = rotacionar, scroll = zoom, direito = pan
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    // Touch: 1 dedo = rotacionar, 2 dedos = pinch (zoom) + pan
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    controls.addEventListener('start', function () {
      userActive = true;
      tween = null; // interação do usuário cancela a animação de câmera
      if (App.UI) App.UI.setViewActive(null);
    });
    controls.addEventListener('end', function () { userActive = false; });

    controls.update();
    return controls;
  }

  // ==========================================
  // PRESETS (FRONT / REAR / TOP / BOTTOM / RESET)
  // Interpolação esférica: a câmera contorna o drone sem atravessá-lo
  // ==========================================
  function goPreset(name, model) {
    if (!controls) return;
    const C = App.CONFIG;
    const toPos = new THREE.Vector3().fromArray(name === 'home' ? C.camera.start : PRESETS[name]);
    const toTarget = new THREE.Vector3(0, 0, 0);

    const fs = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const ts = new THREE.Spherical().setFromVector3(toPos.clone().sub(toTarget));
    let dTheta = ts.theta - fs.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)); // caminho mais curto

    // O modelo também volta ao yaw 0 (múltiplo de 360° mais próximo)
    const yaw = model ? model.rotation.y : 0;
    const toYaw = Math.round(yaw / (Math.PI * 2)) * Math.PI * 2;

    tween = {
      t: 0, dur: 1.2, name: name === 'home' ? 'reset' : name,
      fs: fs, ts: ts, dTheta: dTheta,
      fromTarget: controls.target.clone(), toTarget: toTarget,
      fromYaw: yaw, toYaw: toYaw
    };
  }

  function setAuto(on) { autoRotate = !!on; }
  function isAuto() { return autoRotate; }

  // ==========================================
  // ATUALIZAÇÃO POR FRAME
  // ==========================================
  function update(dt, model) {
    if (!controls) return;

    if (tween) {
      tween.t += dt / tween.dur;
      const k = Math.min(tween.t, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
      const sph = new THREE.Spherical(
        tween.fs.radius + (tween.ts.radius - tween.fs.radius) * e,
        tween.fs.phi + (tween.ts.phi - tween.fs.phi) * e,
        tween.fs.theta + tween.dTheta * e
      );
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      camera.position.setFromSpherical(sph).add(controls.target);
      if (model) model.rotation.y = tween.fromYaw + (tween.toYaw - tween.fromYaw) * e;
      if (k >= 1) {
        const n = tween.name;
        tween = null;
        if (App.UI) App.UI.setViewActive(n);
      }
    } else if (autoRotate && !userActive && model) {
      // Rotação baseada em tempo (rad/s): suave e independente do FPS
      model.rotation.y += App.CONFIG.autoRotateSpeed * dt;
    }

    // Limita o pan para o drone nunca sair totalmente da tela
    if (controls.target.length() > 4) controls.target.setLength(4);
    controls.update(); // necessário para o damping
  }

  // Yaw / pitch / roll exibidos no HUD
  function getAngles(model) {
    if (!controls) return { yaw: 0, pitch: 0, roll: 0 };
    const az = controls.getAzimuthalAngle();
    const polar = controls.getPolarAngle();
    const my = model ? model.rotation.y : 0;
    const mz = model ? model.rotation.z : 0;
    const deg = 180 / Math.PI;
    return {
      yaw: (((az - my) * deg) % 360 + 360) % 360,
      pitch: 90 - polar * deg,
      roll: mz * deg
    };
  }

  App.Controls = {
    initControls: initControls,
    goPreset: goPreset,
    setAuto: setAuto,
    isAuto: isAuto,
    update: update,
    getAngles: getAngles,
    getControls: function () { return controls; }
  };
})();
