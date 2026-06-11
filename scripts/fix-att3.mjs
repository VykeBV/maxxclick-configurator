import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const Q_PER_M = 65534 / 0.3;
const RAIL_DEPTH = 0.014;
const plateBackPlaced = 0.0248;

const path = decodeURIComponent(new URL('../models/Maxxclick-attachment-3.glb', import.meta.url).pathname);
const doc = await io.read(path);

const dOld = plateBackPlaced * Q_PER_M;
const k = RAIL_DEPTH / 0.3;
const D = (k * (65534 - dOld)) / (1 - k);
const ratio = D / dOld;
const qPlateBack = -32767 + dOld; // rear at file-Y MIN (rotation is +90 deg X)

let moved = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const arr = pos.getArray();
    for (let i = 1; i < arr.length; i += 3) { // fileY = index 1
      const v = arr[i];
      if (v < qPlateBack) {
        arr[i] = Math.round(qPlateBack - (qPlateBack - v) * ratio);
        moved++;
      }
    }
    pos.setArray(arr);
  }
}
await io.write(path.replace('.glb', '.cut.glb'), doc);
console.log(`att-3: dOld=${dOld.toFixed(0)}q D=${D.toFixed(0)}q ratio=${ratio.toFixed(3)} moved=${moved}`);
