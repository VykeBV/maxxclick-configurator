import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const path = decodeURIComponent(new URL('../models/Maxxclick-attachment-3.glb', import.meta.url).pathname);
const doc = await io.read(path);

// Print node rotations to resolve the axis mapping definitively
for (const node of doc.getRoot().listNodes()) {
  console.log('node:', node.getName(), 'rotation:', node.getRotation(), 'scale:', node.getScale());
}

// Histogram on file-Y axis, both ends
const values = [];
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const arr = pos.getArray();
    for (let i = 1; i < arr.length; i += 3) values.push(arr[i]);
  }
}
let lo = Infinity, hi = -Infinity;
for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
const BINS = 100;
const hist = new Array(BINS).fill(0);
for (const v of values) hist[Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo)) * BINS))]++;
console.log(`fileY range ${lo} .. ${hi}, verts ${values.length}`);
console.log('-- first 15 bins (MIN end) --');
for (let b = 0; b < 15; b++) console.log(`  ${(lo + (b/BINS)*(hi-lo)).toFixed(0)} ${hist[b]}`);
console.log('-- last 15 bins (MAX end) --');
for (let b = BINS-15; b < BINS; b++) console.log(`  ${(lo + (b/BINS)*(hi-lo)).toFixed(0)} ${hist[b]}`);
