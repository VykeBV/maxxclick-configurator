// Analysis pass: vertex histogram along each hook's mount axis.
// Goal: locate the mount plate plane and the clamp lips (cap + bottom lip)
// that curl behind it, so we can reshape the clamp to match the rail depth.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// mountAxis: the native-space axis pointing AWAY from the wall when mounted.
// att-1/2: plate authored at -X (rotated -90° at runtime) → mount axis 'x'
// att-3:   plate authored at -Z → mount axis 'z'
const HOOKS = [
  { file: '../models/Maxxclick-attachment-1.glb', axis: 'x' },
  { file: '../models/Maxxclick-attachment-2.glb', axis: 'x' },
  { file: '../models/Maxxclick-attachment-3.glb', axis: 'z' },
];

const AXIS_IDX = { x: 0, y: 1, z: 2 };

for (const hook of HOOKS) {
  const doc = await io.read(decodeURIComponent(new URL(hook.file, import.meta.url).pathname));
  const ai = AXIS_IDX[hook.axis];

  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const values = [];

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (arr[i + k] < min[k]) min[k] = arr[i + k];
          if (arr[i + k] > max[k]) max[k] = arr[i + k];
        }
        values.push(arr[i + ai]);
      }
    }
  }

  const lo = min[ai];
  const hi = max[ai];
  const range = hi - lo;
  // 2mm-equivalent bins relative to a ~1m model: use 200 bins
  const BINS = 200;
  const hist = new Array(BINS).fill(0);
  for (const v of values) {
    const b = Math.min(BINS - 1, Math.floor(((v - lo) / range) * BINS));
    hist[b]++;
  }

  const name = hook.file.split('/').pop();
  console.log(`\n=== ${name} (axis ${hook.axis}) ===`);
  console.log(`bbox: [${min.map(v => v.toFixed(3))}] .. [${max.map(v => v.toFixed(3))}]`);
  console.log(`axis range: ${lo.toFixed(4)} .. ${hi.toFixed(4)} (${range.toFixed(4)})`);
  console.log(`verts: ${values.length}`);

  // Print the rear 25% of the histogram (where plate + lips live) with bar chart
  const rearBins = Math.floor(BINS * 0.25);
  const maxCount = Math.max(...hist.slice(0, rearBins));
  console.log(`rear 25% histogram (bin width ${(range / BINS * 1000).toFixed(1)}mm):`);
  for (let b = 0; b < rearBins; b++) {
    const v0 = lo + (b / BINS) * range;
    const bar = '#'.repeat(Math.round((hist[b] / maxCount) * 50));
    if (hist[b] > 0) console.log(`  ${v0.toFixed(4)} ${String(hist[b]).padStart(6)} ${bar}`);
  }
}
