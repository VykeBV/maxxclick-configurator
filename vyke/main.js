import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------- Scene config ---------- */
const ITEM_FIT = 0.95;            // max-dim of a fitted item
const ITEM_SPACING = 1.24;        // x-distance between items on the beam
const BEAM_TOP_Y = 0.55;          // lower beam surface y
const UPPER_BEAM_TOP_Y = 2.10;    // upper beam surface y
const BEAM_LENGTH = 40;           // runs edge-to-edge, fades into fog

/* ---------- Items (fill row-by-row from the top-left) ----------
 * Drop more .glb files into /models and register them here.
 * If src is null a procedural placeholder in the given color is used.
 */
const ITEMS_DATA = [
  { src: 'models/Ludeco-concept-07-purple.glb',         name: 'LUDECO 07',                   kicker: 'LUDECO · CONCEPT' },
  { src: 'models/Render%20Drill.glb',                   name: 'RENDER DRILL',                kicker: 'RENDER · TOOL' },
  { src: 'models/Blue_Liberty_Concept_01.glb',          name: 'BLUE LIBERTY\nCONCEPT 01',    kicker: 'BLUE LIBERTY · CONCEPT' },
  { src: 'models/drill_origami.glb',                    name: 'FERREX 20V\nCOMBI DRILL',     kicker: 'FERREX · POWER CORE' },
  { src: 'models/GGA1012.glb',                          name: 'FERM\nGGA1012',               kicker: 'FERM · ACTION HOBBY' },
  { src: 'models/Batavia_Maxxclick_Storage_Bins.glb',   name: 'BATAVIA\nMAXXCLICK BINS',     kicker: 'BATAVIA · MAXXCLICK' },
];

/* ---------- DOM ---------- */
const canvas = document.getElementById('scene');
const titleEl = document.getElementById('title');
const kickerEl = document.getElementById('kicker');
const loadedEl = document.getElementById('loaded');
const dropzone = document.getElementById('dropzone');
const toast = document.getElementById('toast');

// Floating holographic label above the active pedestal
const floatLabel = document.createElement('div');
floatLabel.className = 'float-label';
floatLabel.innerHTML = `
  <span class="fl-dot"></span>
  <span class="fl-kicker"></span>
  <span class="fl-sep">/</span>
  <span class="fl-name"></span>
  <span class="fl-tether"></span>
`;
document.body.appendChild(floatLabel);
const flKicker = floatLabel.querySelector('.fl-kicker');
const flName = floatLabel.querySelector('.fl-name');

// Celebrate button — hold to charge, release to fire off fireworks.
const celebrateBtn = document.createElement('button');
celebrateBtn.className = 'celebrate-btn';
celebrateBtn.type = 'button';
celebrateBtn.innerHTML = `
  <span class="cb-emoji">🎉</span>
  <span class="cb-label">Celebrate</span>
  <div class="cb-charge"></div>
`;
document.body.appendChild(celebrateBtn);

let celebrateCharging = false;
let celebrateChargeStart = 0;
celebrateBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { celebrateBtn.setPointerCapture(e.pointerId); } catch {}
  celebrateCharging = true;
  celebrateChargeStart = performance.now();
  celebrateBtn.classList.remove('releasing');
  celebrateBtn.classList.add('charging');
});
function endCelebrateCharge() {
  if (!celebrateCharging) return;
  celebrateCharging = false;
  celebrateBtn.classList.remove('charging');
  celebrateBtn.classList.add('releasing');
  const heldMs = performance.now() - celebrateChargeStart;
  if (heldMs < 80) return;                        // ignore stray taps
  // Map 0 → 900ms hold onto 1 → 5 s show duration (matches the CSS fill).
  const charge = Math.min(1, heldMs / 900);
  const durationMs = 1000 + charge * 4000;
  triggerFireworksShow(durationMs);
}
celebrateBtn.addEventListener('pointerup', endCelebrateCharge);
celebrateBtn.addEventListener('pointercancel', endCelebrateCharge);

/* ---------- Renderer / Scene / Camera ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

/* ---------- Sky background + atmospheric fog ---------- */
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#0d0a1a');   // deep indigo zenith
  g.addColorStop(0.40, '#0a0f1e');   // navy
  g.addColorStop(0.72, '#06101c');   // horizon haze
  g.addColorStop(1.00, '#020306');   // ground mist
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0x05080f, 7, 24);

RectAreaLightUniformsLib.init();

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(0.3, 2.2, 9.4);
camera.lookAt(0, 1.55, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- Lighting (moonlit summit) ---------- */
// Cool moonlight key — directional so all pedestals get matching highlights
const keyLight = new THREE.DirectionalLight(0xc9d6ff, 1.6);
keyLight.position.set(3, 8, 2.2);
keyLight.target.position.set(0, 1, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0004;
keyLight.shadow.radius = 8;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 25;
scene.add(keyLight);
scene.add(keyLight.target);

// Warm horizon rim (fake distant sunset glow on the back of items)
const horizonLight = new THREE.DirectionalLight(0xffb487, 0.55);
horizonLight.position.set(-2, 1.4, -4);
scene.add(horizonLight);

// Cool front fill so faces aren't crushed black
const frontFill = new THREE.PointLight(0x6b8eff, 1.6, 14, 1.5);
frontFill.position.set(-2.4, 1.8, 4.2);
scene.add(frontFill);

// Hero spotlight that fades in for the active preview
const previewLight = new THREE.SpotLight(0xffffff, 0, 10, Math.PI * 0.28, 0.6, 1.6);
previewLight.position.set(0, 4.2, 4.0);
previewLight.target.position.set(0, 1.0, 3.0);
scene.add(previewLight);
scene.add(previewLight.target);

scene.add(new THREE.HemisphereLight(0x1c2236, 0x040408, 0.4));

/* ---------- Mountain ridge silhouettes (3 parallax layers) ---------- */
function makeMountainShape(width, baseY, peakHeight, segments, seed) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, baseY - 1.5);
  for (let i = 0; i <= segments; i++) {
    const x = -width / 2 + (width * i / segments);
    const t = i / segments;
    // Layered sines = pseudo-fbm ridge profile
    const n =
      Math.sin(t * 12.0 + seed) * 0.45 +
      Math.sin(t * 4.7 + seed * 1.7) * 0.85 +
      Math.sin(t * 1.6 + seed * 0.7) * 1.10 +
      Math.sin(t * 23.0 + seed * 3.1) * 0.20;
    const h = baseY + ((n + 2.5) / 5.0) * peakHeight;
    shape.lineTo(x, h);
  }
  shape.lineTo(width / 2, baseY - 1.5);
  shape.lineTo(-width / 2, baseY - 1.5);
  return new THREE.ShapeGeometry(shape);
}
function addMountainLayer({ width, baseY, peakHeight, segments, seed, z, color }) {
  const geo = makeMountainShape(width, baseY, peakHeight, segments, seed);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: true, depthWrite: false }));
  m.position.set(0, 0, z);
  scene.add(m);
  return m;
}
addMountainLayer({ width: 60, baseY: -0.2, peakHeight: 6.5, segments: 90, seed: 1.3, z: -16, color: 0x2a3450 });
addMountainLayer({ width: 50, baseY: -0.3, peakHeight: 4.6, segments: 70, seed: 2.7, z: -11, color: 0x151a2c });
addMountainLayer({ width: 42, baseY: -0.4, peakHeight: 3.2, segments: 55, seed: 4.1, z:  -7, color: 0x080b16 });

/* ---------- Stars ---------- */
function buildStars(count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[3 * i + 0] = (Math.random() - 0.5) * 70;
    pos[3 * i + 1] = 4.5 + Math.random() * 14;
    pos[3 * i + 2] = -22 - Math.random() * 8;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.05, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false, fog: false,
  });
  return new THREE.Points(geo, mat);
}
const stars = buildStars(1400);
scene.add(stars);

/* ---------- Fireworks (triggered from the Celebrate button) ---------- */
function makeSparkleSprite() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.80, 'rgba(255,255,255,0.06)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const FW_POOL = 900;
const fwGeo = new THREE.BufferGeometry();
const fwPos = new Float32Array(FW_POOL * 3);
const fwCol = new Float32Array(FW_POOL * 3);   // displayed (fades with life)
const fwSrc = new Float32Array(FW_POOL * 3);   // source color per particle
const fwVel = new Float32Array(FW_POOL * 3);
const fwLife = new Float32Array(FW_POOL);
fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3));
fwGeo.setAttribute('color', new THREE.BufferAttribute(fwCol, 3));
fwGeo.setDrawRange(0, FW_POOL);
const fwMat = new THREE.PointsMaterial({
  vertexColors: true,
  size: 0.55,
  sizeAttenuation: true,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  map: makeSparkleSprite(),
  fog: true,
});
const fireworks = new THREE.Points(fwGeo, fwMat);
fireworks.frustumCulled = false;
scene.add(fireworks);

const FW_PALETTES = [
  [0xffd5a0, 0xff9a5a, 0xffe8c4],    // warm gold
  [0xa8b9ff, 0xd4c8ff, 0xe4ecff],    // cool violet-blue
  [0xff7a8a, 0xffb0c0, 0xffc8d8],    // pink
  [0x84ffb8, 0xb8ffd8, 0xdaffed],    // mint
  [0xffffff, 0xd8dce0, 0xc5ccd5],    // white/silver
];
const _fwColor = new THREE.Color();
const FW_GRAVITY = 4.8;

function spawnBurst(ox, oy, oz, palette) {
  const count = 60 + Math.floor(Math.random() * 45);
  let spawned = 0;
  for (let i = 0; i < FW_POOL && spawned < count; i++) {
    if (fwLife[i] > 0.001) continue;
    fwPos[3 * i + 0] = ox;
    fwPos[3 * i + 1] = oy;
    fwPos[3 * i + 2] = oz;
    // uniform sphere velocity, slightly flattened in z to stay behind the shelf
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 2.1 + Math.random() * 3.2;
    fwVel[3 * i + 0] = Math.sin(phi) * Math.cos(theta) * speed;
    fwVel[3 * i + 1] = Math.cos(phi) * speed;
    fwVel[3 * i + 2] = Math.sin(phi) * Math.sin(theta) * speed * 0.45;
    const hex = palette[Math.floor(Math.random() * palette.length)];
    _fwColor.setHex(hex);
    // 3x overbright for HDR / bloom punch
    const BRIGHT = 3.0;
    fwSrc[3 * i + 0] = _fwColor.r * BRIGHT;
    fwSrc[3 * i + 1] = _fwColor.g * BRIGHT;
    fwSrc[3 * i + 2] = _fwColor.b * BRIGHT;
    fwCol[3 * i + 0] = fwSrc[3 * i + 0];
    fwCol[3 * i + 1] = fwSrc[3 * i + 1];
    fwCol[3 * i + 2] = fwSrc[3 * i + 2];
    fwLife[i] = 1.0;
    spawned++;
  }
  fwGeo.attributes.position.needsUpdate = true;
  fwGeo.attributes.color.needsUpdate = true;
}

let fwShowEndTime = 0;
let fwNextBurstAt = 0;
function triggerFireworksShow(durationMs) {
  const now = performance.now();
  fwShowEndTime = now + durationMs;
  fwNextBurstAt = now;   // kick off first burst immediately
}


function updateFireworks(dt, now) {
  // Schedule new bursts while the show is running
  if (now < fwShowEndTime && now >= fwNextBurstAt) {
    const ox = (Math.random() - 0.5) * 10;
    const oy = 2.4 + Math.random() * 2.2;
    const oz = -3.2 + (Math.random() - 0.5) * 1.4;
    const palette = FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)];
    spawnBurst(ox, oy, oz, palette);
    fwNextBurstAt = now + 160 + Math.random() * 220;
  }
  // Integrate live particles
  let anyAlive = false;
  for (let i = 0; i < FW_POOL; i++) {
    if (fwLife[i] <= 0) continue;
    anyAlive = true;
    fwLife[i] -= dt * 0.55;   // ~1.8s visible lifetime
    const f = fwLife[i] > 0 ? fwLife[i] : 0;
    fwVel[3 * i + 1] -= FW_GRAVITY * dt;
    fwPos[3 * i + 0] += fwVel[3 * i + 0] * dt;
    fwPos[3 * i + 1] += fwVel[3 * i + 1] * dt;
    fwPos[3 * i + 2] += fwVel[3 * i + 2] * dt;
    fwCol[3 * i + 0] = fwSrc[3 * i + 0] * f;
    fwCol[3 * i + 1] = fwSrc[3 * i + 1] * f;
    fwCol[3 * i + 2] = fwSrc[3 * i + 2] * f;
  }
  if (anyAlive) {
    fwGeo.attributes.position.needsUpdate = true;
    fwGeo.attributes.color.needsUpdate = true;
  }
}

/* ---------- Moonbeam shaft ---------- */
function makeShaftTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const ctx = c.getContext('2d');
  const vg = ctx.createLinearGradient(0, 0, 0, 512);
  vg.addColorStop(0.00, 'rgba(200, 216, 255, 0.75)');
  vg.addColorStop(0.60, 'rgba(200, 216, 255, 0.22)');
  vg.addColorStop(1.00, 'rgba(200, 216, 255, 0)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 128, 512);
  // Horizontal soft-edge mask
  const hg = ctx.createLinearGradient(0, 0, 128, 0);
  hg.addColorStop(0.00, 'rgba(0,0,0,0)');
  hg.addColorStop(0.50, 'rgba(255,255,255,1)');
  hg.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, 128, 512);
  return new THREE.CanvasTexture(c);
}
const shaft = new THREE.Mesh(
  new THREE.PlaneGeometry(3.2, 11),
  new THREE.MeshBasicMaterial({
    map: makeShaftTexture(),
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  })
);
shaft.position.set(-4.6, 4.0, -6.8);
shaft.rotation.z = 0.22;
scene.add(shaft);

const shaft2 = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 9),
  new THREE.MeshBasicMaterial({
    map: makeShaftTexture(),
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  })
);
shaft2.position.set(4.8, 3.6, -7.2);
shaft2.rotation.z = -0.28;
scene.add(shaft2);

/* ---------- Reflective dark floor ---------- */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(22, 128),
  new THREE.MeshStandardMaterial({
    color: 0x040408, roughness: 0.30, metalness: 0.78, envMapIntensity: 0.4,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* ---------- Soft preview floor glow ---------- */
const spot = new THREE.Mesh(
  new THREE.CircleGeometry(1.6, 64),
  new THREE.MeshBasicMaterial({
    color: 0xd8dce0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
spot.rotation.x = -Math.PI / 2;
spot.position.set(0, 0.004, 3.0);
scene.add(spot);

/* ---------- Floating beam (edge-to-edge) ---------- */
function buildBeam(topY) {
  const g = new THREE.Group();

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a12, roughness: 0.38, metalness: 0.62, envMapIntensity: 0.5,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x05050a, roughness: 0.18, metalness: 0.9, envMapIntensity: 0.45,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd8dce0, roughness: 0.28, metalness: 0.9,
    emissive: 0x000000, emissiveIntensity: 0,
  });

  // Main beam body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BEAM_LENGTH, 0.22, 0.92),
    beamMat
  );
  body.position.y = topY - 0.12;   // center y
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Inset top surface (glossier "cap")
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(BEAM_LENGTH, 0.022, 0.88),
    topMat
  );
  top.position.y = topY;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  // Gold hairline along the front top edge
  const edgeFront = new THREE.Mesh(
    new THREE.BoxGeometry(BEAM_LENGTH, 0.003, 0.005),
    goldMat
  );
  edgeFront.position.set(0, topY + 0.002, 0.44);
  g.add(edgeFront);

  // Gold hairline along the rear top edge
  const edgeRear = new THREE.Mesh(
    new THREE.BoxGeometry(BEAM_LENGTH, 0.003, 0.005),
    goldMat
  );
  edgeRear.position.set(0, topY + 0.002, -0.44);
  g.add(edgeRear);

  // Thin emissive underline — implies internal LED channel
  const underline = new THREE.Mesh(
    new THREE.BoxGeometry(BEAM_LENGTH, 0.006, 0.01),
    new THREE.MeshStandardMaterial({
      color: 0x0e0e10, roughness: 0.75, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.6,
    })
  );
  underline.position.set(0, topY - 0.23, 0.46);
  g.add(underline);

  return g;
}

// Split items across two levels — bottom-row first, then top-row (right→left on top
// so the sequence reads as an S-curve through the scene).
function itemSlotPosition(i, n) {
  const perLevel = Math.ceil(n / 2);
  const level = i < perLevel ? 0 : 1;                        // 0 = bottom, 1 = top
  const idx = level === 0 ? i : i - perLevel;
  const itemsOnLevel = level === 0 ? perLevel : n - perLevel;
  const t = idx - (itemsOnLevel - 1) / 2;
  const x = t * ITEM_SPACING;
  const y = level === 0 ? BEAM_TOP_Y : UPPER_BEAM_TOP_Y;
  return new THREE.Vector3(x, y, 0);
}

/* ---------- Preview pose ---------- */
const PREVIEW_POS = new THREE.Vector3(0, 0.95, 3.2);   // item-bottom y (between the two beams)
const PREVIEW_SCALE = 1.7;

/* ---------- Loaders ---------- */
const gltfLoader = new GLTFLoader();

function makePlaceholder(color = 0x141420) {
  const group = new THREE.Group();
  const base = new THREE.Color(color);
  const sheen = base.clone().lerp(new THREE.Color(0xffffff), 0.25);

  const mat = new THREE.MeshPhysicalMaterial({
    color: base, roughness: 0.42, metalness: 0.08,
    clearcoat: 0.55, clearcoatRoughness: 0.3,
    sheen: 0.4, sheenColor: sheen,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.05, 0.35), mat);
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);

  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.2, metalness: 0.1,
      emissive: 0x222233, emissiveIntensity: 0.3,
    })
  );
  strip.position.set(0, 0.18, 0.176);
  group.add(strip);
  return group;
}

function fitModel(model, targetMaxDim) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) model.scale.setScalar(targetMaxDim / maxDim);
}

function enableShadows(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) o.material.envMapIntensity = 0.95;
    }
  });
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    }
  });
}

/* ---------- Items ---------- */
const items = [];     // { data, group, shelfPos, state, anim, spinOffset }
let activeItem = null;
let pickableMeshes = [];

function rebuildPickables() {
  pickableMeshes = [];
  items.forEach((it, i) => it.group.traverse((o) => {
    if (o.isMesh) {
      o.userData._itemIndex = i;
      pickableMeshes.push(o);
    }
  }));
}

async function buildItem(data, basePos) {
  const group = new THREE.Group();
  let model;
  if (data.src) {
    try {
      const gltf = await gltfLoader.loadAsync(data.src);
      model = gltf.scene;
    } catch (err) {
      model = makePlaceholder(data.color || 0x141420);
      showToast(`Missing ${data.src.split('/').pop()} — using placeholder`);
    }
  } else {
    model = makePlaceholder(data.color || 0x141420);
  }
  fitModel(model, ITEM_FIT);
  enableShadows(model);
  // Anchor model bottom at group origin so basePos = where the item stands.
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  group.add(model);
  group.position.copy(basePos);
  group.scale.setScalar(1);
  scene.add(group);
  return group;
}

/* ---------- Animation engine ---------- */
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c = 1.2, c3 = c + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function startTween(item, to, duration, onDone) {
  item.anim = {
    from: {
      pos: item.group.position.clone(),
      rotX: item.group.rotation.x,
      rotY: item.group.rotation.y,
      scale: item.group.scale.x,
    },
    to: {
      pos: to.pos,
      rotX: to.rotX ?? 0,
      rotY: to.rotY,
      scale: to.scale,
    },
    duration,
    startTime: performance.now(),
    onDone,
  };
}

function updateTween(item, now) {
  const a = item.anim;
  if (!a) return;
  const t = Math.min(1, (now - a.startTime) / a.duration);
  const eLin = easeInOutCubic(t);
  const eBack = easeOutBack(t);

  item.group.position.lerpVectors(a.from.pos, a.to.pos, eLin);
  item.group.rotation.x = a.from.rotX + (a.to.rotX - a.from.rotX) * eLin;
  item.group.rotation.y = a.from.rotY + (a.to.rotY - a.from.rotY) * eLin;
  const sc = a.from.scale + (a.to.scale - a.from.scale) * eBack;
  item.group.scale.setScalar(sc);

  if (t >= 1) {
    item.anim = null;
    a.onDone?.();
  }
}

function flyOut(item) {
  item.state = 'launching';
  setItemLayer(item, LAYER_PREVIEW);
  startTween(item, {
    pos: PREVIEW_POS.clone(),
    rotY: 0,
    scale: PREVIEW_SCALE,
  }, 720, () => { item.state = 'preview'; });
  activeItem = item;
  updateMeta(item);
}

function flyBack(item) {
  item.state = 'returning';
  startTween(item, {
    pos: item.shelfPos.clone(),
    rotY: 0,
    scale: 1,
  }, 640, () => {
    item.state = 'shelf';
    setItemLayer(item, LAYER_SCENE);
  });
  if (activeItem === item) {
    activeItem = null;
    updateMeta(null);
  }
}

/* ---------- Interaction ---------- */
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();              // see items on LAYER_SCENE and LAYER_PREVIEW
const mouse = new THREE.Vector2();

function itemFromObject(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData._itemIndex !== undefined) {
      return items[o.userData._itemIndex] ?? null;
    }
    o = o.parent;
  }
  return null;
}

function setMouseFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickItem(e) {
  setMouseFromEvent(e);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pickableMeshes, false);
  if (hits.length === 0) return null;
  return itemFromObject(hits[0].object);
}

function handleClick(item) {
  // ignore clicks during any transition
  if (activeItem && (activeItem.state === 'launching' || activeItem.state === 'returning')) return;
  if (item && (item.state === 'launching' || item.state === 'returning')) return;

  if (!item) {
    if (activeItem) flyBack(activeItem);
    return;
  }

  if (item === activeItem && item.state === 'preview') {
    flyBack(item);
    return;
  }

  if (activeItem && activeItem !== item) flyBack(activeItem);
  flyOut(item);
}

/* ---------- Drag-to-rotate (active preview only) ---------- */
const AUTO_SPIN = 0.6;          // rad/sec — default rotation speed
const DRAG_YAW_SENS = 0.012;    // horizontal pixels → yaw radians
const DRAG_PITCH_SENS = 0.008;  // vertical pixels → pitch radians
const PITCH_LIMIT = 0.55;       // clamp so it doesn't flip
const VELOCITY_DECAY = 1.6;     // how fast flick velocity decays back to AUTO_SPIN
const PITCH_RECENTER = 1.4;     // how fast pitch eases back to neutral after release

let spinVelocity = AUTO_SPIN;   // current Y-rotation speed of the active preview
let drag = null;                // { item, lastX, lastY, lastT, totalDist, vY }

// Click vs drag
let pointerStart = null;

canvas.addEventListener('pointerdown', (e) => {
  pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };

  // If pressing on the active previewed item, start a rotation drag.
  const hit = pickItem(e);
  if (hit && hit === activeItem && hit.state === 'preview' && !hit.anim) {
    drag = {
      item: hit,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
      totalDist: 0,
      vY: 0,
    };
    spinVelocity = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const now = performance.now();
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    const dt = Math.max(1, now - drag.lastT) / 1000;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.lastT = now;
    drag.totalDist += Math.hypot(dx, dy);

    const yawDelta = dx * DRAG_YAW_SENS;
    drag.item.group.rotation.y += yawDelta;
    // exponential moving average of angular velocity for inertia on release
    drag.vY = drag.vY * 0.6 + (yawDelta / dt) * 0.4;

    const newPitch = drag.item.group.rotation.x + dy * DRAG_PITCH_SENS;
    drag.item.group.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, newPitch));
    return;
  }

  // Hover cursor
  const item = pickItem(e);
  if (item && item === activeItem && activeItem.state === 'preview') {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = item ? 'pointer' : 'default';
  }
});

function endDrag(e) {
  if (drag) {
    const wasDrag = drag.totalDist > 6;
    // Carry flick momentum; clamp so it doesn't get silly fast.
    const v = Math.max(-8, Math.min(8, drag.vY));
    spinVelocity = wasDrag ? v : AUTO_SPIN;
    canvas.style.cursor = 'grab';
    drag = null;
    if (wasDrag) {
      pointerStart = null; // suppress click
      return;
    }
  }
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  const dist = Math.hypot(dx, dy);
  const dt = performance.now() - pointerStart.t;
  pointerStart = null;
  if (dist > 6 || dt > 600) return;
  const item = pickItem(e);
  handleClick(item);
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => {
  if (drag) {
    spinVelocity = AUTO_SPIN;
    drag = null;
    canvas.style.cursor = 'default';
  }
  pointerStart = null;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeItem && activeItem.state === 'preview') {
    flyBack(activeItem);
  }
});

/* ---------- Meta / HUD ---------- */
function updateMeta(item) {
  if (item) {
    titleEl.innerHTML = item.data.name;
    kickerEl.textContent = item.data.kicker;
    const fileName = item.data.src ? item.data.src.split('/').pop().replace(/%20/g, ' ') : null;
    loadedEl.textContent = fileName
      ? `Previewing "${fileName}" · drag to rotate · click again to return.`
      : 'Procedural placeholder · drag to rotate · click again to return.';
  } else {
    titleEl.innerHTML = '<span class="title-main">Packaging</span><span class="title-accent">Universe</span>';
    kickerEl.textContent = 'TAP A PEDESTAL TO PREVIEW';
    loadedEl.textContent = 'Each pedestal holds a packaging concept. Tap one to bring it forward.';
  }
}

function showToast(msg, duration = 1800) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ---------- Drag-and-drop GLB swap ----------
 * Drop a .glb to replace the currently previewed slot (or the first slot if none).
 */
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropzone.classList.add('show');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) dropzone.classList.remove('show');
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.remove('show');
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.name.toLowerCase().endsWith('.glb')) {
    showToast('Drop a .glb file');
    return;
  }
  const url = URL.createObjectURL(file);
  const target = activeItem || items[0];
  if (!target) return;

  const wasActive = target === activeItem;
  scene.remove(target.group);
  disposeGroup(target.group);

  target.data = {
    src: url,
    name: file.name.replace(/\.glb$/i, '').toUpperCase().replace(/[-_]/g, ' '),
    kicker: 'CUSTOM · DROPPED',
  };
  target.group = await buildItem(target.data, wasActive ? PREVIEW_POS.clone() : target.shelfPos);
  if (wasActive) {
    target.group.scale.setScalar(PREVIEW_SCALE);
    target.state = 'preview';
    activeItem = target;
    updateMeta(target);
  } else {
    target.state = 'shelf';
  }
  rebuildPickables();
  showToast(`Loaded ${file.name}`);
});

/* ---------- Init (two beams + staggered item drop-in) ---------- */
const entrances = [];        // { group, home, startAt, done }
const beamLower = buildBeam(BEAM_TOP_Y);
scene.add(beamLower);
const beamUpper = buildBeam(UPPER_BEAM_TOP_Y);
scene.add(beamUpper);

async function init() {
  const n = ITEMS_DATA.length;
  for (let i = 0; i < n; i++) {
    const data = ITEMS_DATA[i];
    const home = itemSlotPosition(i, n);

    const group = await buildItem(data, home);
    group.visible = false;
    group.scale.setScalar(0.4);

    items.push({
      data,
      group,
      shelfPos: home.clone(),
      state: 'shelf',
      anim: null,
      spinOffset: Math.random() * Math.PI * 2,
    });

    entrances.push({
      group,
      home: home.clone(),
      startAt: performance.now() + 250 + i * 110,
      done: false,
    });
    rebuildPickables();
  }
}

/* ---------- Post-processing (Bloom + MSAA + Output tone mapping) ---------- */
const rtParams = { type: THREE.HalfFloatType, samples: 4 };
const renderTarget = new THREE.WebGLRenderTarget(1, 1, rtParams);
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));

// Depth-of-field — blurs anything not at the focus distance.
// Pass is toggled off when idle so there's zero rendering overhead or softening.
const bokehPass = new BokehPass(scene, camera, {
  focus: 1000.0,
  aperture: 0.0,
  maxblur: 0.0,
});
bokehPass.enabled = false;
composer.addPass(bokehPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.8, 0.82);
// strength, radius, threshold — fireworks bloom heavily, normal scene mildly
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Compact accessor for the bokeh uniforms (works across three.js versions)
const bokehU = (bokehPass.uniforms || bokehPass.materialBokeh.uniforms);

/* ---------- Resize ---------- */
function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------- Render loop ---------- */
const clock = new THREE.Clock();
const _worldPos = new THREE.Vector3();
const _focusBox = new THREE.Box3();
const _focusCenter = new THREE.Vector3();
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const ITEM_DROP_DURATION = 720;

/* ---------- Layer split: active item renders in a crisp overlay pass ---------- */
const LAYER_SCENE = 0;
const LAYER_PREVIEW = 1;
camera.layers.enable(LAYER_PREVIEW);   // so both layers render by default
const setItemLayer = (item, layer) =>
  item.group.traverse((o) => o.layers.set(layer));

function tick() {
  const dt = clock.getDelta();
  const now = performance.now();
  const tSec = now / 1000;

  // --- Entrance animation: items drop in from above ---
  for (const e of entrances) {
    if (e.done) continue;
    const elapsed = now - e.startAt;
    if (elapsed < 0) continue;
    const t = Math.min(1, elapsed / ITEM_DROP_DURATION);
    const et = easeOutCubic(t);
    e.group.visible = true;
    e.group.position.y = e.home.y + 2.5 * (1 - et);
    e.group.scale.setScalar(0.4 + 0.6 * et);
    if (t >= 1) e.done = true;
  }

  // --- Items: animations, preview spin, idle bobbing ---
  for (const item of items) {
    if (item.anim) updateTween(item, now);
    if (item.state === 'shelf' && !item.anim && item.group.visible) {
      const phase = tSec * 0.7 + item.spinOffset;
      item.group.position.y = item.shelfPos.y + Math.sin(phase) * 0.012;
      item.group.rotation.y = Math.sin(phase * 0.5) * 0.08;
    }
    if (item.state === 'preview' && !item.anim) {
      if (drag && drag.item === item) {
        // user is actively dragging
      } else {
        spinVelocity += (AUTO_SPIN - spinVelocity) * Math.min(1, dt * VELOCITY_DECAY);
        item.group.rotation.y += spinVelocity * dt;
        item.group.rotation.x += (0 - item.group.rotation.x) * Math.min(1, dt * PITCH_RECENTER);
      }
    }
  }

  // --- Fireworks update (integration + spawning) ---
  updateFireworks(dt, now);

  // --- Preview lighting + floor spot follow active state ---
  const targetPreviewIntensity = activeItem ? 24 : 0;
  previewLight.intensity += (targetPreviewIntensity - previewLight.intensity) * Math.min(1, dt * 4);
  const targetSpotOpacity = activeItem ? 0.14 : 0;
  spot.material.opacity += (targetSpotOpacity - spot.material.opacity) * Math.min(1, dt * 4);

  // --- Background blur + darken when an item is previewed ---
  // Focus = the active item's center in camera (view) space so the whole item stays sharp.
  let targetFocus = 1000.0;
  if (activeItem) {
    _focusBox.setFromObject(activeItem.group);
    _focusBox.getCenter(_focusCenter);
    _focusCenter.applyMatrix4(camera.matrixWorldInverse);
    targetFocus = Math.max(2.0, -_focusCenter.z);
  }
  // Gentler aperture/maxblur — background softens, item stays crisp edge-to-edge.
  const targetAperture = activeItem ? 0.018 : 0.0;
  const targetMaxBlur = activeItem ? 0.008 : 0.0;
  const targetExposure = activeItem ? 0.72 : 1.10;
  // Enable DOF while active (or transitioning out) so the fade isn't abrupt.
  if (activeItem) bokehPass.enabled = true;
  bokehU.focus.value    += (targetFocus    - bokehU.focus.value)    * Math.min(1, dt * 2.5);
  bokehU.aperture.value += (targetAperture - bokehU.aperture.value) * Math.min(1, dt * 2.5);
  bokehU.maxblur.value  += (targetMaxBlur  - bokehU.maxblur.value)  * Math.min(1, dt * 2.5);
  renderer.toneMappingExposure += (targetExposure - renderer.toneMappingExposure) * Math.min(1, dt * 3);
  // Once fully faded back to idle, turn the pass off so idle frames render pristine.
  if (!activeItem && bokehPass.enabled && bokehU.aperture.value < 0.0005) {
    bokehPass.enabled = false;
  }

  // --- Cinematic camera: drift idle, lean in when active ---
  const camTargetX = activeItem ? 0.10 + Math.sin(tSec * 0.1) * 0.08 : 0.30 + Math.sin(tSec * 0.12) * 0.18;
  const camTargetY = activeItem ? 1.85 + Math.sin(tSec * 0.09) * 0.04 : 2.20 + Math.sin(tSec * 0.09) * 0.06;
  const camTargetZ = activeItem ? 7.60 : 9.40;
  const camLookY   = activeItem ? 1.35 : 1.55;
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 1.4);
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 1.4);
  camera.position.z += (camTargetZ - camera.position.z) * Math.min(1, dt * 1.4);
  camera.lookAt(0, camLookY, 0);

  // --- Floating label follows the active preview ---
  if (activeItem && activeItem.state === 'preview') {
    activeItem.group.getWorldPosition(_worldPos);
    _worldPos.y += 1.15;
    _worldPos.project(camera);
    const sx = (_worldPos.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
    const sy = (1 - (_worldPos.y * 0.5 + 0.5)) * renderer.domElement.clientHeight;
    floatLabel.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    const newKicker = activeItem.data.kicker;
    const newName = activeItem.data.name.replace(/\n/g, ' ');
    if (flKicker.textContent !== newKicker) flKicker.textContent = newKicker;
    if (flName.textContent !== newName) flName.textContent = newName;
    floatLabel.classList.add('show');
  } else {
    floatLabel.classList.remove('show');
  }

  renderFrame();
  requestAnimationFrame(tick);
}

function renderFrame() {
  // Is any item currently in the preview flow (launching / preview / returning)?
  const hasPreview = items.some((it) => it.state !== 'shelf');

  if (hasPreview) {
    // Pass 1: background only (active item is on LAYER_PREVIEW and skipped) with DOF + bloom
    camera.layers.set(LAYER_SCENE);
    composer.render();

    // Pass 2: overlay the active item on top, sharp, no DOF
    const prevBg = scene.background;
    const prevAutoClear = renderer.autoClear;
    scene.background = null;          // keep composer's output intact
    renderer.autoClear = false;
    camera.layers.set(LAYER_PREVIEW);
    renderer.clearDepth();            // fresh depth so the item always draws on top
    renderer.render(scene, camera);

    // Restore state
    scene.background = prevBg;
    renderer.autoClear = prevAutoClear;
    camera.layers.set(LAYER_SCENE);
    camera.layers.enable(LAYER_PREVIEW);
  } else {
    // Nothing active — straight through the composer (no DOF)
    composer.render();
  }
}
tick();

/* ---------- Boot ---------- */
updateMeta(null);
init();
