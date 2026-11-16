// WebGPU setup and drawing: sky, water mesh, solid objects (surfer), and GPU
// particles (simulated in a compute shader, drawn as soft billboards).

import { skyWGSL, waterWGSL, solidWGSL, particleComputeWGSL, particleRenderWGSL } from './shaders.js';
import { buildWaterMesh, buildLipTable, LIP, boxMesh, sphereMesh, boardMesh, cylinderMesh } from './mesh.js';

export const PARTICLES = 40960;
// Cap the render resolution: a Retina laptop at full 2x is ~5M pixels (x4 MSAA);
// this keeps it sharp but much cheaper.
const MAX_PIXELS = 3.2e6;
const SAMPLES = 4;
const MAX_OBJECTS = 48;
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

  const frameBuf = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const camBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const objBuf = device.createBuffer({ size: OBJ_STRIDE * MAX_OBJECTS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const upload = (data, usage) => {
    const b = device.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, data);
    return b;
  };

  // Geometry.
  let water = buildWaterMesh();
  let waterVB = upload(water.verts, GPUBufferUsage.VERTEX);
  let waterIB = upload(water.idx, GPUBufferUsage.INDEX);
  // Solid meshes for the surfer and board, by name.
  const solids = {};
  for (const [name, data] of Object.entries({
    box: boxMesh(), sphere: sphereMesh(12, 18), cyl: cylinderMesh(), board: boardMesh(-1, 0.6), boardNose: boardMesh(0.6, 1, 8),
  })) solids[name] = { vb: upload(orientTriangles(data), GPUBufferUsage.VERTEX), count: data.length / 6 };
  const lipBuf = upload(buildLipTable(), GPUBufferUsage.STORAGE);

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
    vertex: {
      module: waterMod, entryPoint: 'vs',
      buffers: [{ arrayStride: 36, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
      ] }],
    },
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
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } },
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
  const waterBG = bg(waterPipe, [{ binding: 0, resource: { buffer: frameBuf } }]);
  const frameBG = device.createBindGroup({ layout: frameLayout, entries: [{ binding: 0, resource: { buffer: frameBuf } }] });
  const objBG = device.createBindGroup({ layout: objLayout, entries: [{ binding: 0, resource: { buffer: objBuf, size: 80 } }] });
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

  const frameData = new Float32Array(64);
  const objData = new Float32Array((OBJ_STRIDE / 4) * MAX_OBJECTS);

  // f: { viewProj, invViewProj, camPos, time, sunDir, peel, rider, spray, riderVel, dt, sprayDir, frame, burst, camRight, camUp }
  // objects: [{ mesh: 'box'|'sphere'|'board'|'boardNose', model: Float32Array(16), color: [r,g,b] }]
  function render(f, objects, opts = {}) {
    resize();
    frameData.set(f.viewProj, 0);
    frameData.set(f.invViewProj, 16);
    frameData.set([...f.camPos, f.time], 32);
    frameData.set([...f.sunDir, f.peel], 36);
    frameData.set([...f.rider, f.spray], 40);
    frameData.set([...f.riderVel, f.dt], 44);
    frameData.set([...f.sprayDir, f.frame], 48);
    frameData.set([LIP.x0, LIP.step, LIP.count, f.burst], 52);
    device.queue.writeBuffer(frameBuf, 0, frameData);
    device.queue.writeBuffer(camBuf, 0, new Float32Array([...f.camRight, 0, ...f.camUp, 0]));
    const n = Math.min(objects.length, MAX_OBJECTS);
    for (let i = 0; i < n; i++) {
      objData.set(objects[i].model, i * 64);
      objData.set([...objects[i].color, objects[i].outline ?? 0.018], i * 64 + 16); // w = outline thickness
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
    pass.setVertexBuffer(0, waterVB);
    pass.setIndexBuffer(waterIB, 'uint32');
    pass.drawIndexed(water.count);

    pass.setBindGroup(0, frameBG);
    for (let i = 0; i < n && opts.outlines !== false; i++) {
      if ((objects[i].outline ?? 0.018) <= 0) continue;
      pass.setPipeline(mirrored(objects[i].model) !== !!opts.mirror ? outlinePipeMirrored : outlinePipe);
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

    if (opts.particles !== false) {
      pass.setPipeline(prPipe);
      pass.setBindGroup(0, prBG);
      pass.draw(6, PARTICLES);
    }
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  // Rebuild everything that depends on the active wave (after useWave()).
  function rebuildWave() {
    waterVB.destroy(); waterIB.destroy();
    water = buildWaterMesh();
    waterVB = upload(water.verts, GPUBufferUsage.VERTEX);
    waterIB = upload(water.idx, GPUBufferUsage.INDEX);
    device.queue.writeBuffer(lipBuf, 0, buildLipTable());
  }

  return { render, device, rebuildWave };
}
