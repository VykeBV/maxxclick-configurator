import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/* ---------------- Product catalog ---------------- */
const PRODUCTS = [
  {
    id: 'rail',
    name: 'Steel Rail · 58 cm',
    price: '€9.99',
    priceValue: 9.99,
    src: 'models/Maxxclick-rail.glb',
    type: 'rail',
  },
  // rotationY orients each GLB so its mount face points at the wall (-Z) and
  // its body faces the viewer (+Z). Values were determined by inspecting each
  // model's geometry — see inspect.html. forceColor overrides the GLB's baked
  // textures with a flat finish (used to render the wire hooks in matte black).
  {
    id: 'adapter',
    name: 'Tool & Battery Adapter',
    price: '€24.99',
    priceValue: 24.99,
    src: 'models/Maxxclick-adapter.glb',
    type: 'attachment',
    rotationY: 0, // H-channel mount already faces -Z
  },
  {
    id: 'attachment-1',
    name: 'Attachment 1',
    price: '€9.99',
    priceValue: 9.99,
    src: 'models/Maxxclick-attachment-1.glb',
    type: 'attachment',
    rotationY: -Math.PI / 2, // mount plate authored at -X
    forceColor: 0x161616,
  },
  {
    id: 'attachment-2',
    name: 'Attachment 2',
    price: '€9.99',
    priceValue: 9.99,
    src: 'models/Maxxclick-attachment-2.glb',
    type: 'attachment',
    rotationY: -Math.PI / 2, // mount plate authored at -X
    forceColor: 0x161616,
  },
  {
    id: 'attachment-3',
    name: 'Attachment 3',
    price: '€9.99',
    priceValue: 9.99,
    src: 'models/Maxxclick-attachment-3.glb',
    type: 'attachment',
    rotationY: Math.PI, // mount plate authored at +Z
    forceColor: 0x161616,
  },
  {
    id: 'attachment-4',
    name: 'Attachment 4',
    price: '€9.99',
    priceValue: 9.99,
    src: 'models/Maxxclick-attachment-4.glb',
    type: 'attachment',
    rotationY: Math.PI, // bin back authored at +Z
  },
];
const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/* ---------------- World constants ---------------- */
const WALL_Z = 0;
const WALL_WIDTH = 5;
const WALL_HEIGHT = 3.2;
const FLOOR_DEPTH = 4;

/* ---------------- DOM ---------------- */
const canvas = document.getElementById('scene');
const productListEl = document.getElementById('product-list');
const dropOverlay = document.getElementById('drop-overlay');
const loaderEl = document.getElementById('loader');
const toastEl = document.getElementById('toast');
const hudCount = document.getElementById('hud-count');
const hudHint = document.getElementById('hud-hint');
const btnClear = document.getElementById('btn-clear');
const btnReset = document.getElementById('btn-reset');
const stageEl = canvas.parentElement;
const cartItemsEl = document.getElementById('cart-items');
const cartTotalEl = document.getElementById('cart-total');
const cartToggleTotalEl = document.getElementById('cart-toggle-total');
const cartSubEl = document.getElementById('cart-sub');
const cartPanelEl = document.getElementById('cart-panel');
const cartToggleBtn = document.getElementById('cart-toggle');
const btnCart = document.getElementById('btn-cart');
const hoverChip = document.getElementById('hover-chip');
const hoverMoveBtn = document.getElementById('hover-move');
const hoverDeleteBtn = document.getElementById('hover-delete');

/* ---------------- Renderer / Scene / Camera ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdad7d0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
camera.position.set(0.6, 1.7, 2.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.4, 0);
controls.minDistance = 0.6;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.55;
controls.minAzimuthAngle = -Math.PI * 0.5;
controls.maxAzimuthAngle = Math.PI * 0.5;

/* ---------------- Lighting ---------------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c4bc, 1.1));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const keyLight = new THREE.DirectionalLight(0xfff3dc, 3.4);
keyLight.position.set(2.5, 4.2, 3.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -3.5;
keyLight.shadow.camera.right = 3.5;
keyLight.shadow.camera.top = 3.5;
keyLight.shadow.camera.bottom = -1;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 15;
keyLight.shadow.bias = -0.0002;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbdd3ff, 1.1);
fillLight.position.set(-3.2, 2.4, 2.8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd9a8, 0.7);
rimLight.position.set(0, 2, -2);
scene.add(rimLight);

/* ---------------- Wall + Floor ---------------- */
const wallGeo = new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT);
const wallMat = new THREE.MeshStandardMaterial({
  color: 0xf4f1ea,
  roughness: 0.96,
  metalness: 0.0,
});
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.set(0, WALL_HEIGHT / 2, WALL_Z);
wall.receiveShadow = true;
scene.add(wall);

const floorGeo = new THREE.PlaneGeometry(WALL_WIDTH + 4, FLOOR_DEPTH);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x363636,
  roughness: 0.85,
  metalness: 0.05,
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, FLOOR_DEPTH / 2);
floor.receiveShadow = true;
scene.add(floor);

// Baseboard where wall meets floor
const baseGeo = new THREE.BoxGeometry(WALL_WIDTH, 0.09, 0.022);
const baseMat = new THREE.MeshStandardMaterial({ color: 0xbfbab2, roughness: 0.8 });
const baseboard = new THREE.Mesh(baseGeo, baseMat);
baseboard.position.set(0, 0.045, 0.012);
baseboard.castShadow = true;
baseboard.receiveShadow = true;
scene.add(baseboard);

/* ---------------- State ---------------- */
const rails = []; // each: { group, bbox, frontZ, centerY, minX, maxX, attachments }
const placedAttachments = []; // { mesh, rail, product }

/* ---------------- Model loading (cached prototypes) ---------------- */
const loader = new GLTFLoader();
// Optimized GLBs use EXT_meshopt_compression; this decoder lets the loader read them.
loader.setMeshoptDecoder(MeshoptDecoder);
const prototypeCache = new Map();

function getPrototype(src) {
  if (!prototypeCache.has(src)) {
    const p = new Promise((resolve, reject) => {
      loader.load(src, (gltf) => {
        prepareMesh(gltf.scene);
        resolve(gltf.scene);
      }, undefined, reject);
    });
    prototypeCache.set(src, p);
  }
  return prototypeCache.get(src);
}

function prepareMesh(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && 'envMapIntensity' in o.material) {
        o.material.envMapIntensity = 1.0;
      }
    }
  });
}

function cloneFromPrototype(proto) {
  const c = proto.clone(true);
  prepareMesh(c);
  return c;
}

function makeGhost(source) {
  const clone = source.clone(true);
  clone.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.material = new THREE.MeshStandardMaterial({
        color: 0xf49b00,
        transparent: true,
        opacity: 0.55,
        emissive: 0xf49b00,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.2,
      });
    }
  });
  return clone;
}

/* ---------------- Rail & attachment geometry helpers ---------------- */

// Normalize a rail: long axis along X, geometry centered on local origin.
// Returns the depth (along Z) of the rail after normalization.
function normalizeRail(clone) {
  const bb = new THREE.Box3().setFromObject(clone);
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  clone.position.sub(center);

  let longAxis;
  if (size.x >= size.y && size.x >= size.z) longAxis = 'x';
  else if (size.z >= size.y) longAxis = 'z';
  else longAxis = 'y';
  if (longAxis === 'z') clone.rotation.y = Math.PI / 2;

  // Measure after rotation
  clone.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(clone);
  return {
    depth: bb2.max.z - bb2.min.z,
    height: bb2.max.y - bb2.min.y,
    width: bb2.max.x - bb2.min.x,
  };
}

// Build a placeable attachment: rotate, scale, then anchor it so the top edge
// of the MOUNT PLATE — not the top of the whole model — lines up at local
// y=0. The caller places that local origin at (railX, rail.bbox.max.y,
// rail.frontZ). Effect: the plate covers the rail's front face from rail-top
// down, any clip cap or hood extends ABOVE the rail (wrapping around its top
// edge as it does on the real product), and the body hangs below.
//
// "Plate top" is found by slicing the model's vertices closest to the back
// face — the cap/hood lives slightly forward of the plate so it falls out of
// the slice naturally. For monolithic attachments like the storage bin, the
// back face covers the full Y of the model, so plate-top equals model-top
// and behaviour is unchanged from a simple top-anchor.
//
// The outer wrapping group in makeAttachmentInstance() keeps these `.position`
// shifts alive when the caller does `outer.position.set(...)` on the group.
const ATTACHMENT_TARGET_HEIGHT = 0.16; // ~16 cm — Maxxclick accessory scale
const BACK_SLICE_FRAC = 0.04;          // sample the first 4% of depth as "back"

function fitAttachmentToRail(obj, _rail, product) {
  obj.rotation.y = product?.rotationY ?? 0;
  obj.updateMatrixWorld(true);

  const raw = new THREE.Box3().setFromObject(obj);
  const rawSize = raw.getSize(new THREE.Vector3());
  const scale = ATTACHMENT_TARGET_HEIGHT / Math.max(rawSize.y, 0.001);
  obj.scale.setScalar(scale);
  obj.updateMatrixWorld(true);

  const bb = new THREE.Box3().setFromObject(obj);
  const back = measureBackFaceY(obj, BACK_SLICE_FRAC);
  const xCenter = (bb.min.x + bb.max.x) / 2;
  obj.position.x -= xCenter;
  obj.position.y -= back.maxY; // plate top → local y=0 (cap/hood extends above)
  obj.position.z -= bb.min.z;  // back face → local z=0
}

const _tmpVec = new THREE.Vector3();
function measureBackFaceY(obj, sliceFrac) {
  const bb = new THREE.Box3().setFromObject(obj);
  const backZThreshold = bb.min.z + (bb.max.z - bb.min.z) * sliceFrac;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.updateMatrixWorld(true);
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      _tmpVec.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (_tmpVec.z <= backZThreshold) {
        if (_tmpVec.y < minY) minY = _tmpVec.y;
        if (_tmpVec.y > maxY) maxY = _tmpVec.y;
        any = true;
      }
    }
  });
  if (!any) { minY = bb.min.y; maxY = bb.max.y; }
  return { minY, maxY };
}

function makeAttachmentInstance(proto, product, rail) {
  const inner = cloneFromPrototype(proto);
  if (product.forceColor !== undefined) applyForceColor(inner, product.forceColor);
  fitAttachmentToRail(inner, rail, product);
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}

// Override all materials on a clone with a flat coloured PBR material.
// Used for hooks where we want a uniform matte black finish, ignoring the
// source GLB's painted textures.
function applyForceColor(root, hex) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.55,
        metalness: 0.35,
      });
    }
  });
}

/* ---------------- Spawn a rail at (worldX, worldY) on the wall ---------------- */
async function spawnRail(worldX, worldY) {
  const proto = await getPrototype('models/Maxxclick-rail.glb');
  const clone = cloneFromPrototype(proto);

  const group = new THREE.Group();
  group.add(clone);
  const dims = normalizeRail(clone);

  scene.add(group);

  // Place so back face (local min.z) sits on the wall (world z = WALL_Z)
  // After centering, local bbox is symmetric around origin, so shift by half depth.
  group.position.set(worldX, worldY, WALL_Z + dims.depth / 2);
  group.updateMatrixWorld(true);

  const bbox = new THREE.Box3().setFromObject(group);
  const rail = {
    group,
    bbox,
    frontZ: bbox.max.z,
    centerY: (bbox.min.y + bbox.max.y) / 2,
    minX: bbox.min.x,
    maxX: bbox.max.x,
    width: bbox.max.x - bbox.min.x,
    attachments: [],
  };
  rails.push(rail);
  rebuildDimensionAnnotations();
  updateHud();
  updateCart();
  return rail;
}

/* ---------------- Dimension annotations (per connected chain of rails) ---------------- */
const DIM_COLOR = 0xf49b00;
const CHAIN_SAME_Y = 0.08; // within 8 cm vertically
const CHAIN_TOUCH = 0.04;  // within 4 cm edge-to-edge → treated as joined

// Annotation objects (one per chain). Each: { group, label, anchor }
const chainAnnotations = [];

// Union-find groups of rails whose edges are touching at the same height.
function computeRailChains() {
  const parent = rails.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < rails.length; i++) {
    for (let j = i + 1; j < rails.length; j++) {
      const a = rails[i], b = rails[j];
      if (Math.abs(a.centerY - b.centerY) > CHAIN_SAME_Y) continue;
      const gap = Math.min(Math.abs(a.maxX - b.minX), Math.abs(b.maxX - a.minX));
      if (gap <= CHAIN_TOUCH) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < rails.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(rails[i]);
  }
  return [...groups.values()].map((chain) => chain.sort((a, b) => a.minX - b.minX));
}

function clearChainAnnotations() {
  for (const a of chainAnnotations) {
    if (a.group) {
      scene.remove(a.group);
      a.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    if (a.label) a.label.remove();
  }
  chainAnnotations.length = 0;
}

function rebuildDimensionAnnotations() {
  clearChainAnnotations();
  const chains = computeRailChains();

  for (const chain of chains) {
    const minX = Math.min(...chain.map((r) => r.minX));
    const maxX = Math.max(...chain.map((r) => r.maxX));
    const topY = Math.max(...chain.map((r) => r.bbox.max.y));
    const frontZ = Math.max(...chain.map((r) => r.frontZ));
    const widthCm = Math.round((maxX - minX) * 100);

    const offsetY = 0.09;
    const dimY = topY + offsetY;
    const zPlane = frontZ + 0.003;

    const mat = new THREE.LineDashedMaterial({
      color: DIM_COLOR,
      dashSize: 0.014,
      gapSize: 0.009,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });

    const group = new THREE.Group();
    group.renderOrder = 999;

    const hLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(minX, dimY, zPlane),
        new THREE.Vector3(maxX, dimY, zPlane),
      ]),
      mat
    );
    hLine.computeLineDistances();
    group.add(hLine);

    for (const x of [minX, maxX]) {
      const ext = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, topY + 0.01, zPlane),
          new THREE.Vector3(x, dimY + 0.012, zPlane),
        ]),
        mat
      );
      ext.computeLineDistances();
      group.add(ext);
    }

    scene.add(group);

    const label = document.createElement('div');
    label.className = 'dim-label';
    label.textContent = `${widthCm} cm`;
    stageEl.appendChild(label);

    chainAnnotations.push({
      group,
      label,
      anchor: new THREE.Vector3((minX + maxX) / 2, dimY + 0.02, zPlane),
    });
  }
}

const _projVec = new THREE.Vector3();
function updateDimensionLabels() {
  for (const a of chainAnnotations) {
    _projVec.copy(a.anchor).project(camera);
    const visible = _projVec.z < 1 && _projVec.z > -1;
    if (!visible) {
      a.label.style.opacity = '0';
      continue;
    }
    const x = (_projVec.x * 0.5 + 0.5) * stageEl.clientWidth;
    const y = (-_projVec.y * 0.5 + 0.5) * stageEl.clientHeight;
    a.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    a.label.style.opacity = '1';
  }
}

/* ---------------- Ghost group ---------------- */
const ghostGroup = new THREE.Group();
ghostGroup.visible = false;
scene.add(ghostGroup);

/* ---------------- Drag & drop ---------------- */
let activeDragProduct = null;
let activeTargetRail = null;
let ghostMeta = null; // { type, proto, halfDepth? }

async function onDragStart(e, product) {
  if (product.type === 'attachment' && rails.length === 0) {
    e.preventDefault();
    showToast('Place a rail on the wall first');
    return;
  }

  activeDragProduct = product;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', product.id);
  e.currentTarget.classList.add('dragging');

  const proto = await getPrototype(product.src);
  const ghost = makeGhost(proto);

  ghostGroup.clear();

  if (product.type === 'rail') {
    const dims = normalizeRail(ghost);
    ghostGroup.add(ghost);
    ghostMeta = {
      type: 'rail',
      proto,
      halfDepth: dims.depth / 2,
      halfWidth: dims.width / 2,
    };
  } else {
    const refRail = rails[0];
    fitAttachmentToRail(ghost, refRail, product);
    ghostGroup.add(ghost);
    ghost.updateMatrixWorld(true);
    const gbb = new THREE.Box3().setFromObject(ghost);
    ghostMeta = {
      type: 'attachment',
      proto,
      halfWidth: (gbb.max.x - gbb.min.x) / 2,
    };
  }
}

function onDragEnd(card) {
  card.classList.remove('dragging');
  ghostGroup.visible = false;
  dropOverlay.classList.remove('active');
  activeDragProduct = null;
  activeTargetRail = null;
  ghostMeta = null;
}

function placePreviewAt(clientX, clientY) {
  if (!ghostMeta) return null;

  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  if (ghostMeta.type === 'rail') {
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(wallPlane, hit)) return null;

    const halfW = WALL_WIDTH / 2 - 0.3;
    let x = THREE.MathUtils.clamp(hit.x, -halfW, halfW);
    let y = THREE.MathUtils.clamp(hit.y, 0.3, WALL_HEIGHT - 0.3);

    // Snap the ghost end-to-end with an existing rail at a similar Y
    const snap = snapRailToNeighbour(x, y, ghostMeta.halfWidth);
    x = snap.x;
    y = snap.y;

    ghostGroup.position.set(x, y, WALL_Z + ghostMeta.halfDepth);
    ghostGroup.visible = true;
    return { type: 'rail', x, y, snapped: snap.snapped };
  }

  // Attachment: prefer direct raycast hit on a rail, otherwise nearest rail by Y on wall plane
  const railGroups = rails.map((r) => r.group);
  const hits = raycaster.intersectObjects(railGroups, true);

  let target = null;
  let hitX = 0;

  if (hits.length > 0) {
    hitX = hits[0].point.x;
    // Walk up to find which rail group this mesh belongs to
    let node = hits[0].object;
    while (node && !rails.find((r) => r.group === node)) node = node.parent;
    target = rails.find((r) => r.group === node) || null;
  }

  if (!target) {
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(wallPlane, hit)) return null;
    hitX = hit.x;
    let bestDy = Infinity;
    for (const r of rails) {
      const dy = Math.abs(r.centerY - hit.y);
      if (dy < bestDy) {
        bestDy = dy;
        target = r;
      }
    }
  }

  if (!target) return null;
  activeTargetRail = target;

  const halfW = ghostMeta.halfWidth || 0.04;
  const margin = 0.02 + halfW;
  const clampedX = THREE.MathUtils.clamp(hitX, target.minX + margin, target.maxX - margin);
  const snap = avoidOverlap(clampedX, halfW, target, null);

  setGhostValidity(snap.fits);
  ghostGroup.position.set(snap.x, target.bbox.max.y, target.frontZ);
  ghostGroup.visible = true;
  return { type: 'attachment', x: snap.x, rail: target, fits: snap.fits };
}

/* ---------------- Overlap avoidance for attachments ---------------- */
// Returns { x, fits } — x is the nearest non-overlapping position on the rail,
// and fits is false if no room was found (in which case x is the requested value).
function avoidOverlap(x, halfW, rail, excludeMesh) {
  const ranges = [];
  for (const a of rail.attachments) {
    if (a === excludeMesh) continue;
    const bb = new THREE.Box3().setFromObject(a);
    ranges.push({ min: bb.min.x, max: bb.max.x });
  }
  ranges.sort((a, b) => a.min - b.min);

  const overlapsAt = (cx) => {
    const cMin = cx - halfW;
    const cMax = cx + halfW;
    return ranges.some((r) => !(cMax <= r.min || cMin >= r.max));
  };

  if (!overlapsAt(x)) return { x, fits: true };

  const railLeft = rail.minX + halfW + 0.01;
  const railRight = rail.maxX - halfW - 0.01;
  const candidates = [railLeft, railRight];
  for (const r of ranges) {
    candidates.push(r.min - halfW - 0.005);
    candidates.push(r.max + halfW + 0.005);
  }
  const valid = candidates
    .filter((cx) => cx >= railLeft - 1e-6 && cx <= railRight + 1e-6 && !overlapsAt(cx))
    .sort((a, b) => Math.abs(a - x) - Math.abs(b - x));

  if (valid.length === 0) return { x, fits: false };
  return { x: valid[0], fits: true };
}

function setGhostValidity(fits) {
  ghostGroup.traverse((o) => {
    if (o.isMesh && o.material) {
      const col = fits ? 0xf49b00 : 0xff4d4d;
      if (o.material.color) o.material.color.setHex(col);
      if (o.material.emissive) o.material.emissive.setHex(col);
    }
  });
}

/* Snap a candidate rail (at worldX,worldY with given halfWidth) end-to-end
 * against an existing rail whose centerY is close. Returns the possibly
 * adjusted { x, y, snapped }. Snapping distance is generous in X so the user
 * feels the magnet; strict in Y so different rows stay independent. */
const RAIL_Y_SNAP = 0.15;   // 15 cm — lock to the same horizontal row
const RAIL_X_SNAP = 0.3;    // 30 cm — magnet range around the adjacent edge
function snapRailToNeighbour(x, y, halfWidth) {
  let best = null;
  for (const r of rails) {
    const dy = Math.abs(r.centerY - y);
    if (dy > RAIL_Y_SNAP) continue;

    const ghostLeft = x - halfWidth;
    const ghostRight = x + halfWidth;
    const dRight = Math.abs(ghostLeft - r.maxX); // ghost placed to the right of r
    const dLeft = Math.abs(ghostRight - r.minX); // ghost placed to the left of r

    if (dRight < RAIL_X_SNAP && (!best || dRight < best.d)) {
      best = { d: dRight, x: r.maxX + halfWidth, y: r.centerY };
    }
    if (dLeft < RAIL_X_SNAP && (!best || dLeft < best.d)) {
      best = { d: dLeft, x: r.minX - halfWidth, y: r.centerY };
    }
  }
  if (best) return { x: best.x, y: best.y, snapped: true };
  return { x, y, snapped: false };
}

/* Stage drop listeners */
stageEl.addEventListener('dragover', (e) => {
  if (!activeDragProduct) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  dropOverlay.classList.add('active');
  placePreviewAt(e.clientX, e.clientY);
});

stageEl.addEventListener('dragleave', (e) => {
  if (e.target === stageEl || e.target === canvas) {
    dropOverlay.classList.remove('active');
    ghostGroup.visible = false;
  }
});

stageEl.addEventListener('drop', async (e) => {
  if (!activeDragProduct) return;
  e.preventDefault();
  const result = placePreviewAt(e.clientX, e.clientY);
  if (!result) return;

  if (result.type === 'rail') {
    await spawnRail(result.x, result.y);
    showToast(result.snapped ? 'Snapped to adjacent rail' : `Added: ${activeDragProduct.name}`);
  } else {
    if (result.fits === false) {
      showToast('No room on this rail — attachments would overlap');
    } else {
      const proto = await getPrototype(activeDragProduct.src);
      const instance = makeAttachmentInstance(proto, activeDragProduct, result.rail);
      instance.position.set(result.x, result.rail.bbox.max.y, result.rail.frontZ);
      scene.add(instance);
      result.rail.attachments.push(instance);
      placedAttachments.push({ mesh: instance, rail: result.rail, product: activeDragProduct });
      showToast(`Added: ${activeDragProduct.name}`);
      updateHud();
      updateCart();
    }
  }

  ghostGroup.visible = false;
  dropOverlay.classList.remove('active');
  document.querySelectorAll('.product-card.dragging').forEach((c) => c.classList.remove('dragging'));
  activeDragProduct = null;
  activeTargetRail = null;
  ghostMeta = null;
});

/* ---------------- Double-click to remove ---------------- */
const clickRaycaster = new THREE.Raycaster();
canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  clickRaycaster.setFromCamera(ndc, camera);

  // Try attachments first
  const attMeshes = placedAttachments.map((p) => p.mesh);
  const attHits = clickRaycaster.intersectObjects(attMeshes, true);
  if (attHits.length > 0) {
    let node = attHits[0].object;
    while (node && !placedAttachments.find((p) => p.mesh === node)) node = node.parent;
    const idx = placedAttachments.findIndex((p) => p.mesh === node);
    if (idx !== -1) {
      const entry = placedAttachments[idx];
      scene.remove(entry.mesh);
      entry.rail.attachments = entry.rail.attachments.filter((m) => m !== entry.mesh);
      placedAttachments.splice(idx, 1);
      updateHud();
      showToast(`Removed: ${entry.product.name}`);
      return;
    }
  }

  // Then try rails
  const railGroups = rails.map((r) => r.group);
  const railHits = clickRaycaster.intersectObjects(railGroups, true);
  if (railHits.length > 0) {
    let node = railHits[0].object;
    while (node && !rails.find((r) => r.group === node)) node = node.parent;
    const ri = rails.findIndex((r) => r.group === node);
    if (ri !== -1) {
      const r = rails[ri];
      // remove attachments of this rail
      for (const a of r.attachments) {
        scene.remove(a);
        const pi = placedAttachments.findIndex((p) => p.mesh === a);
        if (pi !== -1) placedAttachments.splice(pi, 1);
      }
      scene.remove(r.group);
      rails.splice(ri, 1);
      rebuildDimensionAnnotations();
      updateHud();
      updateCart();
      showToast('Removed: Steel Rail');
    }
  }
});

/* ---------------- Clear / reset ---------------- */
btnClear.addEventListener('click', () => {
  if (rails.length === 0 && placedAttachments.length === 0) return;
  for (const p of placedAttachments) scene.remove(p.mesh);
  placedAttachments.length = 0;
  for (const r of rails) scene.remove(r.group);
  rails.length = 0;
  clearChainAnnotations();
  updateHud();
  updateCart();
  showToast('Cleared the wall');
  spawnRail(0, 1.5);
});

btnReset.addEventListener('click', () => {
  focusCamera();
  showToast('View reset');
});

function focusCamera() {
  const focusY = rails.length ? rails[0].centerY : 1.5;
  const bb = rails.length ? rails[0].bbox : null;
  const width = bb ? bb.max.x - bb.min.x : 0.6;
  // Back off camera so the full rail is comfortably framed plus headroom.
  const distance = Math.max(width * 3.0, 1.8);
  controls.target.set(0, focusY, 0);
  camera.position.set(distance * 0.3, focusY + distance * 0.15, distance);
  controls.update();
}

function updateHud() {
  const r = rails.length;
  const a = placedAttachments.length;
  hudCount.textContent = `${r} rail${r === 1 ? '' : 's'} · ${a} attachment${a === 1 ? '' : 's'}`;
  if (r === 0) {
    hudHint.textContent = 'Drag a rail onto the wall to begin';
  } else if (a === 0) {
    hudHint.textContent = 'Drag attachments from the left onto a rail';
  } else {
    hudHint.textContent = 'Double-click a rail or attachment to remove';
  }
}

/* ---------------- Sidebar cards ---------------- */
function buildProductCards() {
  for (const p of PRODUCTS) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.draggable = true;
    card.dataset.productId = p.id;
    card.innerHTML = `
      <div class="product-thumb" data-thumb></div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-price">${p.price} · tap or drag</div>
      </div>
      <div class="product-add" aria-hidden="true">+</div>
    `;
    productListEl.appendChild(card);

    card.addEventListener('dragstart', (e) => onDragStart(e, p));
    card.addEventListener('dragend', () => onDragEnd(card));

    // Click-to-add: primary mobile-friendly path, also works on desktop.
    // Guarded so a drag doesn't also fire a click on release.
    card.addEventListener('click', (e) => {
      if (activeDragProduct) return;
      if (card.classList.contains('dragging')) return;
      autoPlaceProduct(p);
    });

    renderThumbnail(p, card.querySelector('[data-thumb]'));
  }
}

/* ---------------- Click-to-add: auto-place products without dragging ---------------- */
async function autoPlaceProduct(product) {
  if (product.type === 'rail') {
    await autoPlaceRail(product);
  } else {
    if (rails.length === 0) {
      showToast('Place a rail on the wall first');
      return;
    }
    await autoPlaceAttachment(product);
  }
}

// Add a new rail in the most sensible spot: chain to the rightmost rail if
// there's room, otherwise stack a row below the lowest rail.
async function autoPlaceRail(product) {
  if (rails.length === 0) {
    await spawnRail(0, 1.5);
    showToast(`Added: ${product.name}`);
    return;
  }

  const proto = await getPrototype(product.src);
  const sample = cloneFromPrototype(proto);
  const dims = normalizeRail(sample);
  const halfW = dims.width / 2;
  const wallHalf = WALL_WIDTH / 2 - 0.3;

  const rightmost = rails.reduce((a, b) => (a.maxX > b.maxX ? a : b));
  const candidateX = rightmost.maxX + halfW + 0.002;

  if (candidateX + halfW <= wallHalf) {
    await spawnRail(candidateX, rightmost.centerY);
    showToast('Snapped to adjacent rail');
    return;
  }

  const lowest = rails.reduce((a, b) => (a.centerY < b.centerY ? a : b));
  const newY = lowest.centerY - 0.4;
  if (newY > 0.3) {
    await spawnRail(0, newY);
    showToast(`Added: ${product.name}`);
  } else {
    showToast('Wall is full — clear something first');
  }
}

// Place an attachment on the first rail with free room, left-to-right.
async function autoPlaceAttachment(product) {
  const proto = await getPrototype(product.src);

  // Measure this product's width by fitting onto a reference rail.
  const sample = cloneFromPrototype(proto);
  fitAttachmentToRail(sample, rails[0], product);
  sample.updateMatrixWorld(true);
  const sbb = new THREE.Box3().setFromObject(sample);
  const halfW = (sbb.max.x - sbb.min.x) / 2;

  for (const rail of rails) {
    const ranges = rail.attachments
      .map((m) => {
        const b = new THREE.Box3().setFromObject(m);
        return { min: b.min.x, max: b.max.x };
      })
      .sort((a, b) => a.min - b.min);

    const gap = 0.01;
    let x = rail.minX + halfW + gap;
    let placed = false;
    for (const r of ranges) {
      if (x + halfW + gap <= r.min) {
        placed = true;
        break;
      }
      x = Math.max(x, r.max + halfW + gap);
    }
    if (!placed) placed = x + halfW + gap <= rail.maxX;

    if (placed) {
      const instance = makeAttachmentInstance(proto, product, rail);
      instance.position.set(x, rail.bbox.max.y, rail.frontZ);
      scene.add(instance);
      rail.attachments.push(instance);
      placedAttachments.push({ mesh: instance, rail, product });
      showToast(`Added: ${product.name}`);
      updateHud();
      updateCart();
      return;
    }
  }

  showToast('All rails are full — add another rail');
}

/* ---------------- Thumbnails ---------------- */
async function renderThumbnail(product, container) {
  try {
    const proto = await getPrototype(product.src);
    const tRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    tRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    tRenderer.setSize(96, 96);
    tRenderer.outputColorSpace = THREE.SRGBColorSpace;
    tRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    tRenderer.toneMappingExposure = 1.2;

    const tScene = new THREE.Scene();
    tScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    tScene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.0));
    const tLight = new THREE.DirectionalLight(0xffffff, 2.5);
    tLight.position.set(2, 3, 2);
    tScene.add(tLight);

    const obj = proto.clone(true);
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    obj.scale.setScalar(1 / maxDim);
    tScene.add(obj);

    const tCam = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
    tCam.position.set(1.0, 0.8, 1.4);
    tCam.lookAt(0, 0, 0);

    tRenderer.render(tScene, tCam);
    container.appendChild(tRenderer.domElement);

    let raf = null;
    const start = () => {
      if (raf) return;
      const tick = () => {
        obj.rotation.y += 0.02;
        tRenderer.render(tScene, tCam);
        raf = requestAnimationFrame(tick);
      };
      tick();
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    };
    container.parentElement.addEventListener('mouseenter', start);
    container.parentElement.addEventListener('mouseleave', stop);
  } catch (err) {
    console.warn('thumb fail', product.id, err);
    container.textContent = '3D';
    container.style.color = '#8a94a6';
    container.style.fontSize = '10px';
    container.style.fontWeight = '600';
  }
}

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    // Preload attachment prototypes in parallel
    for (const p of PRODUCTS) getPrototype(p.src).catch(() => {});

    await spawnRail(0, 1.5);
    focusCamera();
    hideLoader();
    buildProductCards();
  } catch (err) {
    console.error('Boot failed:', err);
    loaderEl.querySelector('.loader-text').textContent = 'Failed to load 3D scene';
  }
}

function hideLoader() {
  loaderEl.classList.add('hidden');
  setTimeout(() => loaderEl.remove(), 400);
}

function showToast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('visible'), ms);
}

/* ---------------- Cart rendering ---------------- */
function updateCart() {
  const rows = [];
  if (rails.length > 0) {
    const rp = PRODUCT_BY_ID.rail;
    rows.push({ name: rp.name, priceEach: rp.priceValue, qty: rails.length });
  }
  const byId = new Map();
  for (const pa of placedAttachments) {
    const prev = byId.get(pa.product.id);
    if (prev) prev.qty += 1;
    else byId.set(pa.product.id, { name: pa.product.name, priceEach: pa.product.priceValue, qty: 1 });
  }
  for (const r of byId.values()) rows.push(r);

  if (rows.length === 0) {
    cartItemsEl.innerHTML = '<div class="cart-empty">No items yet — click or drag a product onto the wall.</div>';
    cartTotalEl.textContent = '€0.00';
    cartToggleTotalEl.textContent = '€0.00';
    cartSubEl.textContent = 'Empty';
    btnCart.disabled = true;
    return;
  }

  let total = 0;
  let totalQty = 0;
  cartItemsEl.innerHTML = '';
  for (const r of rows) {
    const sub = r.priceEach * r.qty;
    total += sub;
    totalQty += r.qty;
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div class="cart-row-qty">${r.qty}×</div>
      <div class="cart-row-main">
        <div class="cart-row-name">${r.name}</div>
        <div class="cart-row-meta">€${r.priceEach.toFixed(2)} each</div>
      </div>
      <div class="cart-row-price">€${sub.toFixed(2)}</div>
    `;
    cartItemsEl.appendChild(row);
  }
  cartTotalEl.textContent = `€${total.toFixed(2)}`;
  cartToggleTotalEl.textContent = `€${total.toFixed(2)}`;
  cartSubEl.textContent = `${totalQty} item${totalQty === 1 ? '' : 's'}`;
  btnCart.disabled = false;
}

// Mobile: tap the cart header to expand/collapse the bottom sheet.
// On desktop the toggle just acts as a static header (body is always visible).
cartToggleBtn.addEventListener('click', () => {
  cartPanelEl.classList.toggle('expanded');
});

btnCart.addEventListener('click', () => {
  // Placeholder — Shopify integration hooked in later.
  showToast('Shopify cart integration coming soon');
});

/* ---------------- Hover chip (× delete / ↔ move) ---------------- */
let hoveredEntry = null;
let chipHideTimer = null;
const hoverRaycaster = new THREE.Raycaster();

function pickAttachmentAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  hoverRaycaster.setFromCamera(ndc, camera);
  const meshes = placedAttachments.map((p) => p.mesh);
  const hits = hoverRaycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return null;
  let node = hits[0].object;
  while (node && !placedAttachments.find((p) => p.mesh === node)) node = node.parent;
  return placedAttachments.find((p) => p.mesh === node) || null;
}

// The chip sits above the 3D object, separated by a gap of empty canvas.
// A strict hover model (hide the moment the pointer leaves the object) would
// hide the chip while the cursor traverses that gap, making it unclickable.
// Instead: delay the hide so the pointer has time to reach the chip, and
// cancel the hide when it enters the chip.
function cancelChipHide() {
  if (chipHideTimer) {
    clearTimeout(chipHideTimer);
    chipHideTimer = null;
  }
}

function scheduleChipHide(ms = 220) {
  cancelChipHide();
  chipHideTimer = setTimeout(() => {
    hoveredEntry = null;
    chipHideTimer = null;
  }, ms);
}

canvas.addEventListener('pointermove', (e) => {
  if (movingEntry) return; // move mode handles its own cursor logic
  if (activeDragProduct) return;
  const entry = pickAttachmentAt(e.clientX, e.clientY);
  if (entry) {
    cancelChipHide();
    hoveredEntry = entry;
  } else if (hoveredEntry) {
    scheduleChipHide();
  }
});

canvas.addEventListener('pointerleave', () => {
  if (!movingEntry && hoveredEntry) scheduleChipHide();
});

hoverChip.addEventListener('pointerenter', cancelChipHide);
hoverChip.addEventListener('pointerleave', () => scheduleChipHide());

function updateHoverChip() {
  if (movingEntry) {
    hoverChip.classList.remove('visible');
    return;
  }
  if (!hoveredEntry) {
    hoverChip.classList.remove('visible');
    return;
  }
  const bb = new THREE.Box3().setFromObject(hoveredEntry.mesh);
  const anchor = new THREE.Vector3(
    (bb.min.x + bb.max.x) / 2,
    bb.max.y + 0.03,
    (bb.min.z + bb.max.z) / 2
  );
  anchor.project(camera);
  const visible = anchor.z < 1 && anchor.z > -1;
  if (!visible) {
    hoverChip.classList.remove('visible');
    return;
  }
  const x = (anchor.x * 0.5 + 0.5) * stageEl.clientWidth;
  const y = (-anchor.y * 0.5 + 0.5) * stageEl.clientHeight;
  hoverChip.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`;
  hoverChip.classList.add('visible');
}

hoverDeleteBtn.addEventListener('click', () => {
  if (!hoveredEntry) return;
  const entry = hoveredEntry;
  scene.remove(entry.mesh);
  entry.rail.attachments = entry.rail.attachments.filter((m) => m !== entry.mesh);
  const idx = placedAttachments.indexOf(entry);
  if (idx !== -1) placedAttachments.splice(idx, 1);
  hoveredEntry = null;
  updateHud();
  updateCart();
  showToast(`Removed: ${entry.product.name}`);
});

/* ---------------- Move mode ---------------- */
let movingEntry = null;
let movingHalfWidth = 0;
let movingValid = true;

hoverMoveBtn.addEventListener('click', () => {
  if (!hoveredEntry || movingEntry) return;
  enterMoveMode(hoveredEntry);
});

function enterMoveMode(entry) {
  const bb = new THREE.Box3().setFromObject(entry.mesh);
  movingEntry = entry;
  movingHalfWidth = (bb.max.x - bb.min.x) / 2;
  movingValid = true;
  controls.enabled = false;
  hoverMoveBtn.classList.add('active');
  hoverChip.classList.remove('visible');
  canvas.style.cursor = 'grabbing';
  showToast('Click to place · Esc to cancel');
}

function exitMoveMode(commit) {
  if (!movingEntry) return;
  if (!commit) {
    // Could revert to original position, but since the entry moves during preview,
    // simplest is to leave it where it last validly was. That's already the case.
  }
  movingEntry = null;
  controls.enabled = true;
  hoverMoveBtn.classList.remove('active');
  canvas.style.cursor = '';
  updateCart();
}

canvas.addEventListener('pointermove', (e) => {
  if (!movingEntry) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  hoverRaycaster.setFromCamera(ndc, camera);

  const railGroups = rails.map((r) => r.group);
  const hits = hoverRaycaster.intersectObjects(railGroups, true);
  let target = null;
  let hitX = 0;
  if (hits.length > 0) {
    hitX = hits[0].point.x;
    let node = hits[0].object;
    while (node && !rails.find((r) => r.group === node)) node = node.parent;
    target = rails.find((r) => r.group === node) || null;
  } else {
    // fall back to current rail at closest Y
    const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z);
    const hit = new THREE.Vector3();
    if (hoverRaycaster.ray.intersectPlane(wallPlane, hit)) {
      let bestDy = Infinity;
      for (const r of rails) {
        const dy = Math.abs(r.centerY - hit.y);
        if (dy < bestDy) { bestDy = dy; target = r; }
      }
      hitX = hit.x;
    }
  }
  if (!target) return;

  const margin = 0.02 + movingHalfWidth;
  const clampedX = THREE.MathUtils.clamp(hitX, target.minX + margin, target.maxX - margin);
  const snap = avoidOverlap(clampedX, movingHalfWidth, target, movingEntry.mesh);

  movingValid = snap.fits;
  movingEntry.mesh.position.set(snap.x, target.bbox.max.y, target.frontZ);
  // keep rail membership in sync
  if (movingEntry.rail !== target) {
    movingEntry.rail.attachments = movingEntry.rail.attachments.filter((a) => a !== movingEntry.mesh);
    movingEntry.rail = target;
    if (!target.attachments.includes(movingEntry.mesh)) target.attachments.push(movingEntry.mesh);
  }
});

canvas.addEventListener('click', (e) => {
  if (!movingEntry) return;
  if (!movingValid) {
    showToast('No room there — move to an empty spot or press Esc');
    return;
  }
  exitMoveMode(true);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && movingEntry) exitMoveMode(false);
});

/* ---------------- Resize & render loop ---------------- */
function resize() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function tick() {
  controls.update();
  updateDimensionLabels();
  updateHoverChip();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

updateCart();
boot();
