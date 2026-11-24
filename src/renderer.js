// WebGPU setup and drawing: sky, water mesh, solid objects (surfer), and GPU
// particles (simulated in a compute shader, drawn as soft billboards).

import { skyWGSL, waterWGSL, solidWGSL, particleComputeWGSL, particleRenderWGSL, skinnedWGSL } from './shaders.js';
import { buildWaterTable, buildWaterIndices, slicePhases, WATER_XS, COLS, TABLE, buildLipTable, LIP, boxMesh, sphereMesh, boardMesh, cylinderMesh, BOARDS } from './mesh.js';
import { SCALE, WAVE, SHAPE } from './wave.js';

export const PARTICLES = 40960;
// Cap the render resolution: a Retina laptop at full 2x is ~5M pixels (x4 MSAA);
// this keeps it sharp but much cheaper.
const MAX_PIXELS = 3.2e6;
const SAMPLES = 4;
const MAX_OBJECTS = 96; // (pieces of the surfer and board drawn each frame; past this they were dropped: the rash guard's extra pieces cost Queens an arm)
const OBJ_STRIDE = 256;

// Make every triangle wind the same way relative to its normals, so the
// outline pass works for every mesh, whichever way its builder wound them.
function orientTriangles(v) {
  const out = new Float32Array(v);
  for (let i = 0; i < out.length; i += 18) {
    const a = [out[i], out[i + 1], out[i + 2]], b = [out[i + 6], out[i + 7], out[i + 8]], c = [out[i + 12], out[i + 13], out[i + 14]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const vn = [out[i + 3] + out[i + 9] + out[i + 15], out[i + 4] + out[i + 10] + out[i + 16], out[i + 5] + out[i + 11] + out[i + 17]];
    if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] < 0) {
      // swap the second and third vertices
      for (let k = 0; k < 6; k++) { const t = out[i + 6 + k]; out[i + 6 + k] = out[i + 12 + k]; out[i + 12 + k] = t; }
    }
  }
  return out;
}

export async function createRenderer(canvas) {
  if (!navigator.gpu) throw new Error('no-webgpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no-webgpu');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const frameBuf = device.createBuffer({ size: 272, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const camBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const objBuf = device.createBuffer({ size: OBJ_STRIDE * MAX_OBJECTS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const upload = (data, usage) => {
    const b = device.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, data);
    return b;
  };

  // Geometry.
  // Water: a cross-section table (rebuilt per wave), each slice's phase
  // (every frame), and the grid's triangles (fixed).
  const waterIdx = buildWaterIndices();
  const waterIB = upload(waterIdx, GPUBufferUsage.INDEX);
  let waterTable = upload(buildWaterTable(), GPUBufferUsage.STORAGE);
  const slicePhaseData = slicePhases();
  const sliceBuf = upload(slicePhaseData, GPUBufferUsage.STORAGE);
  const waterInfoBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const writeWaterInfo = () => {
    const b = new ArrayBuffer(64), u = new Uint32Array(b), f = new Float32Array(b);
    u[0] = COLS; u[1] = WATER_XS.length; u[2] = TABLE.rows; u[3] = SHAPE.a; u[10] = SHAPE.b; f[9] = SHAPE.w; // (shape sets: wave.js SHAPE)
    f[4] = TABLE.sMin; f[5] = TABLE.sMax; f[6] = SCALE; f[7] = WAVE.turquoise || 0; // (clear, shallow water: Queens)
    f[8] = WAVE.green || 0; // (cold, green water: Raglan)
    f[11] = WAVE.ridges ? 1 : 0; // (Raglan+: the shape blends per slice by the reef ridge, shaders.js tableAt)
    f[12] = WAVE.tubeScale ? 2 : WAVE.tube ? 1 : 0; // (a barrel: lumpy whitewater only once its tube has collapsed; 2: per slice, a built wave's shape)
    device.queue.writeBuffer(waterInfoBuf, 0, b);
  };
  writeWaterInfo();
  // Solid meshes for the surfer and board, by name.
  const solids = {};
  for (const [name, data] of Object.entries({
    box: boxMesh(), sphere: sphereMesh(12, 18), cyl: cylinderMesh(),
    // every board: 'board-<name>' and its colored nose 'boardNose-<name>'
    // (a board with a rail color also gets 'boardRail-<name>', its edge band, finer round the ring)
    ...Object.fromEntries(Object.entries(BOARDS).flatMap(([k, b]) => b.colors && b.colors.rail
      ? [[`board-${k}`, boardMesh(b, -1, b.noseFrom, 28, 32, 'body')], [`boardNose-${k}`, boardMesh(b, b.noseFrom, 1, 8, 32, 'body')], [`boardRail-${k}`, boardMesh(b, -1, 1, 48, 32, 'rail')]]
      : [[`board-${k}`, boardMesh(b, -1, b.noseFrom)], [`boardNose-${k}`, boardMesh(b, b.noseFrom, 1, 8)]])),
  })) solids[name] = { vb: upload(orientTriangles(data), GPUBufferUsage.VERTEX), count: data.length / 6 };
  const lipData = buildLipTable();
  const lipBuf = upload(lipData, GPUBufferUsage.STORAGE);

  // Particles start dead with staggered negative life so they trickle in.
  const pInit = new Float32Array(PARTICLES * 12);
  for (let i = 0; i < PARTICLES; i++) { pInit[i * 12 + 1] = -10; pInit[i * 12 + 3] = Math.random() * 2.5; } // staggered first spawns
  const partBuf = upload(pInit, GPUBufferUsage.STORAGE);

  const ms = { count: SAMPLES };
  const depth = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };
  const mod = (code) => device.createShaderModule({ code });

  const skyMod = mod(skyWGSL);
  const skyPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: skyMod, entryPoint: 'vs' },
    fragment: { module: skyMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    multisample: ms,
  });

  const waterMod = mod(waterWGSL);
  const waterPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: waterMod, entryPoint: 'vs' },
    fragment: { module: waterMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depth,
    multisample: ms,
  });

  const solidMod = mod(solidWGSL);
  const frameLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  ] });
  const objLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 96 } },
  ] });
  const solidPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, objLayout] }),
    vertex: {
      module: solidMod, entryPoint: 'vs',
      buffers: [{ arrayStride: 24, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
      ] }],
    },
    fragment: { module: solidMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depth,
    multisample: ms,
  });
  // Ink outlines (inverted hull: the inside of each part, pushed out along
  // its normals). A mirrored (left-handed) model matrix flips which side of
  // a triangle faces the camera, so there's a pipeline for each.
  const makeOutlinePipe = (cullMode) => device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, objLayout] }),
    vertex: {
      module: solidMod, entryPoint: 'vsOutline',
      buffers: [{ arrayStride: 24, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
      ] }],
    },
    fragment: { module: solidMod, entryPoint: 'fsOutline', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode },
    depthStencil: depth,
    multisample: ms,
  });
  const outlinePipe = makeOutlinePipe('front'), outlinePipeMirrored = makeOutlinePipe('back');
  const mirrored = (m) => // determinant of the 3x3 part < 0
    m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;

  const pcMod = mod(particleComputeWGSL);
  const pcPipe = device.createComputePipeline({ layout: 'auto', compute: { module: pcMod, entryPoint: 'cs' } });
  const prMod = mod(particleRenderWGSL);
  const prPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: prMod, entryPoint: 'vs' },
    fragment: {
      module: prMod, entryPoint: 'fs',
      targets: [{ format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      } }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
    multisample: ms,
  });

  const bg = (pipe, entries) => device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
  const skyBG = bg(skyPipe, [{ binding: 0, resource: { buffer: frameBuf } }]);
  const makeWaterBG = () => bg(waterPipe, [
    { binding: 0, resource: { buffer: frameBuf } },
    { binding: 1, resource: { buffer: waterInfoBuf } },
    { binding: 2, resource: { buffer: waterTable } },
    { binding: 3, resource: { buffer: sliceBuf } },
  ]);
  let waterBG = makeWaterBG();
  const frameBG = device.createBindGroup({ layout: frameLayout, entries: [{ binding: 0, resource: { buffer: frameBuf } }] });
  const objBG = device.createBindGroup({ layout: objLayout, entries: [{ binding: 0, resource: { buffer: objBuf, size: 96 } }] });
  const pcBG = bg(pcPipe, [
    { binding: 0, resource: { buffer: frameBuf } },
    { binding: 1, resource: { buffer: partBuf } },
    { binding: 2, resource: { buffer: lipBuf } },
  ]);
  const prBG = bg(prPipe, [
    { binding: 0, resource: { buffer: frameBuf } },
    { binding: 1, resource: { buffer: partBuf } },
    { binding: 2, resource: { buffer: camBuf } },
  ]);

  let msTex = null, depthTex = null, size = [0, 0];
  function resize() {
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = canvas.clientWidth * canvas.clientHeight;
    if (css * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / css);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w === size[0] && h === size[1]) return;
    size = [w, h];
    canvas.width = w; canvas.height = h;
    msTex?.destroy(); depthTex?.destroy();
    msTex = device.createTexture({ size: [w, h], sampleCount: SAMPLES, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    depthTex = device.createTexture({ size: [w, h], sampleCount: SAMPLES, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  const frameData = new Float32Array(68);
  const objData = new Float32Array((OBJ_STRIDE / 4) * MAX_OBJECTS);

  // f: { viewProj, invViewProj, camPos, time, sunDir, peel, rider, spray, riderVel, dt, sprayDir, frame, burst, camRight, camUp }
  // objects: [{ mesh: 'box'|'sphere'|'board'|'boardNose', model: Float32Array(16), color: [r,g,b] }]
  function render(f, objects, opts = {}) {
    resize();
    // The wave changes over time (sections, set sizes): each slice's phase,
    // the size, and where spray comes off.
    device.queue.writeBuffer(sliceBuf, 0, slicePhases(slicePhaseData));
    writeWaterInfo();
    device.queue.writeBuffer(lipBuf, 0, buildLipTable(lipData));
    frameData.set(f.viewProj, 0);
    frameData.set(f.invViewProj, 16);
    frameData.set([...f.camPos, f.time], 32);
    frameData.set([...f.sunDir, f.peel], 36);
    frameData.set([...f.rider, f.spray], 40);
    frameData.set([...f.riderVel, f.dt], 44);
    frameData.set([...f.sprayDir, f.frame], 48);
    frameData.set([LIP.x0, LIP.step, LIP.count, f.burst], 52);
    frameData.set([Math.min(1, Math.max(0.3, WAVE.scale / 1.25)), WAVE.rippleK || 1, WAVE.dir < 0 ? -1 : 1, opts.look ? (opts.shadow === false ? 0.75 : 1) : 0], 56); // (w: the real look; 1 with the surfer's shadow, 0.75 without) // particle scale: smaller spray on small waves (Queens); ripple scale (finer on Queens)
    frameData.set([f.flow ?? 0, f.flowDev ?? 0, 0, 0], 60); // (flow: how far the water texture has flowed; flowDev: peel speed beyond its smoothed value)
    frameData.set(f.hand || [0, 0, 0, 0], 64); // (a hand dragging in the face: where, how much)
    device.queue.writeBuffer(frameBuf, 0, frameData);
    device.queue.writeBuffer(camBuf, 0, new Float32Array([...f.camRight, 0, ...f.camUp, 0]));
    const n = Math.min(objects.length, MAX_OBJECTS);
    for (let i = 0; i < n; i++) {
      objData.set(objects[i].model, i * 64);
      objData.set([...objects[i].color, objects[i].outline ?? 0.018], i * 64 + 16); // w = outline thickness
      objData.set([objects[i].spec ?? 0.1, 0, 0, 0], i * 64 + 20); // material: x = shine (the real look)
    }
    if (n) device.queue.writeBuffer(objBuf, 0, objData, 0, n * 64);

    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(pcPipe);
    cp.setBindGroup(0, pcBG);
    cp.dispatchWorkgroups(Math.ceil(PARTICLES / 64));
    cp.end();

    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: msTex.createView(), resolveTarget: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0.7, 0.84, 0.92, 1] }],
      depthStencilAttachment: { view: depthTex.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
    });
    pass.setPipeline(skyPipe);
    pass.setBindGroup(0, skyBG);
    pass.draw(3);

    pass.setPipeline(waterPipe);
    pass.setBindGroup(0, waterBG);
    pass.setIndexBuffer(waterIB, 'uint32');
    pass.drawIndexed(waterIdx.length);

    pass.setBindGroup(0, frameBG);
    for (let i = 0; i < n && opts.outlines !== false && !opts.look; i++) { // (no ink in the real look)
      if ((objects[i].outline ?? 0.018) <= 0) continue;
      pass.setPipeline(mirrored(objects[i].model) ? outlinePipeMirrored : outlinePipe);
      pass.setBindGroup(1, objBG, [i * OBJ_STRIDE]);
      const m = solids[objects[i].mesh] || solids.box;
      pass.setVertexBuffer(0, m.vb);
      pass.draw(m.count);
    }
    pass.setPipeline(solidPipe);
    pass.setBindGroup(0, frameBG);
    for (let i = 0; i < n; i++) {
      const o = objects[i];
      pass.setBindGroup(1, objBG, [i * OBJ_STRIDE]);
      const m = solids[o.mesh] || solids.box;
      pass.setVertexBuffer(0, m.vb);
      pass.draw(m.count);
    }

    if (opts.body && skinned) {
      device.queue.writeBuffer(skinned.bones, 0, opts.body);
      pass.setPipeline(skinned.pipe);
      pass.setBindGroup(0, frameBG);
      pass.setBindGroup(1, skinned.bg);
      skinned.vbs.forEach((b, i) => pass.setVertexBuffer(i, b));
      pass.setIndexBuffer(skinned.ib, skinned.indexFormat);
      pass.drawIndexed(skinned.count);
    }

    if (opts.particles !== false) {
      pass.setPipeline(prPipe);
      pass.setBindGroup(0, prBG);
      pass.draw(6, PARTICLES);
    }
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  // The skinned body (body.js): set once its model has loaded; drawn when render() gets opts.body.
  let skinned = null;
  const skinMod = mod(skinnedWGSL);
  const bonesLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
  function setBody(model, colors) {
    const pad4 = (a) => { const bytes = a.byteLength, out = new Uint8Array(Math.ceil(bytes / 4) * 4); out.set(new Uint8Array(a.buffer, a.byteOffset, bytes)); return out; };
    const mk = (a, usage) => { const d = pad4(a); const b = device.createBuffer({ size: d.byteLength, usage: usage | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(b, 0, d); return b; };
    const V = GPUBufferUsage.VERTEX;
    const j8 = model.jointFormat === 'uint8x4';
    const pipe = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, bonesLayout] }),
      vertex: { module: skinMod, entryPoint: 'vs', buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
        { arrayStride: j8 ? 4 : 8, attributes: [{ shaderLocation: 2, offset: 0, format: model.jointFormat }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] },
      ] },
      fragment: { module: skinMod, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth,
      multisample: ms,
    });
    const bones = device.createBuffer({ size: model.boneNames.length * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    skinned?.bufs.forEach((b) => b.destroy());
    const bufs = [mk(model.pos, V), mk(model.nrm, V), mk(model.joints, V), mk(model.weights, V), mk(colors, V)];
    const ib = mk(model.index, GPUBufferUsage.INDEX);
    skinned = { pipe, bufs: [...bufs, ib, bones], vbs: bufs, ib, bones, count: model.index.length, indexFormat: model.indexFormat,
      bg: device.createBindGroup({ layout: bonesLayout, entries: [{ binding: 0, resource: { buffer: bones } }] }) };
  }

  // Rebuild everything that depends on the active wave (after useWave()).
  function rebuildWave() {
    waterTable.destroy();
    waterTable = upload(buildWaterTable(), GPUBufferUsage.STORAGE);
    waterBG = makeWaterBG();
  }

  return { render, device, rebuildWave, setBody };
}
