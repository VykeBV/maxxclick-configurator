// Geometry surgery: compress each hook's clamp-lip region so the mount
// plate's back face lands exactly on the rail's front face when placed.
//
// Coordinates are quantized int16 (KHR_mesh_quantization). The full range of
// the depth axis (65534 q-units) maps to the runtime-fitted 0.3 m, so
// q-per-metre = 218,447. Per model we know (measured in the live scene):
//   - plate back position (placed-space z, rail front at 0.014)
//   - lip rear lands at the wall (placed z = 0) via the runtime zOffset
// Surgery remaps vertices behind the plate plane: lip depth becomes exactly
// one rail depth (0.014 m) measured AFTER the runtime refits the slightly
// shorter model back to 0.3 m total. The remap is piecewise-linear and
// continuous at the plate plane, so no cracks appear.
//
// File-space axes differ from runtime axes because of the Blender Y-up
// rotation node: runtime nativeY = file.z, nativeZ = -file.y, nativeX = file.x.
//   att-1/2: plate at native -X → file -X → rear at file-X MIN
//   att-3:   plate at native -Z → file +Y → rear at file-Y MAX (inverted!)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const Q_PER_M = 65534 / 0.3;
const RAIL_DEPTH = 0.014;

// plateGap: measured placed-space distance from rail front to plate back.
const HOOKS = [
  { file: 'Maxxclick-attachment-1.glb', axisIdx: 0, rearAtMin: true,  plateBackPlaced: 0.0247 },
  { file: 'Maxxclick-attachment-2.glb', axisIdx: 0, rearAtMin: true,  plateBackPlaced: 0.0180 },
  { file: 'Maxxclick-attachment-3.glb', axisIdx: 1, rearAtMin: false, plateBackPlaced: 0.0248 },
];

for (const hook of HOOKS) {
  const path = decodeURIComponent(new URL(`../models/${hook.file}`, import.meta.url).pathname);
  const doc = await io.read(path);

  // Distance lip-rear → plate-back in q units (placed z 0 → plateBackPlaced)
  const dOld = hook.plateBackPlaced * Q_PER_M;
  // Solve for new lip depth D so that after the runtime refit
  // (total shrinks by dOld - D), D maps to exactly RAIL_DEPTH:
  //   0.3 * D / (65534 - dOld + D) = RAIL_DEPTH
  const k = RAIL_DEPTH / 0.3;
  const D = (k * (65534 - dOld)) / (1 - k);
  const ratio = D / dOld;

  const qPlateBack = hook.rearAtMin ? -32767 + dOld : 32767 - dOld;

  let moved = 0;
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = hook.axisIdx; i < arr.length; i += 3) {
        total++;
        const v = arr[i];
        if (hook.rearAtMin && v < qPlateBack) {
          arr[i] = Math.round(qPlateBack - (qPlateBack - v) * ratio);
          moved++;
        } else if (!hook.rearAtMin && v > qPlateBack) {
          arr[i] = Math.round(qPlateBack + (v - qPlateBack) * ratio);
          moved++;
        }
      }
      pos.setArray(arr);
    }
  }

  await io.write(path.replace('.glb', '.cut.glb'), doc);
  console.log(
    `${hook.file}: dOld=${dOld.toFixed(0)}q (${(hook.plateBackPlaced * 1000).toFixed(1)}mm) → ` +
    `D=${D.toFixed(0)}q ratio=${ratio.toFixed(3)} | moved ${moved}/${total} verts`
  );
}
console.log('done');
