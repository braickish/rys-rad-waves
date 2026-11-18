// A minimal glTF binary (.glb) reader for one skinned mesh: the surfer's body (built from MakeHuman's CC0 core
// assets, see AGENTS.md "Skinned body"). No dependencies. Returns the vertex data, the bones' names and their
// inverse bind matrices, and each bone's rest pose (head position and axes) in the model's space.
import { invert } from './math.js';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

export function parseSkinnedGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const read = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = TYPED[a.componentType], n = COMPONENTS[a.type];
    const start = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (v.byteStride && v.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved accessors are not supported');
    return new T(bin.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const prim = json.meshes[0].primitives[0], at = prim.attributes;
  const skin = json.skins[0];
  const ibm = read(skin.inverseBindMatrices);
  const boneNames = skin.joints.map((j) => json.nodes[j].name);
  const rest = {};
  boneNames.forEach((name, b) => {
    const w = invert(Array.from(ibm.subarray(b * 16, b * 16 + 16))); // rest pose of the bone in the model's space
    rest[name] = { index: b, head: [w[12], w[13], w[14]], x: [w[0], w[1], w[2]], y: [w[4], w[5], w[6]], z: [w[8], w[9], w[10]] };
  });
  let joints = read(at.JOINTS_0);
  const jointFormat = joints instanceof Uint8Array ? 'uint8x4' : 'uint16x4';
  let index = read(prim.indices);
  return {
    pos: read(at.POSITION), nrm: read(at.NORMAL), uv: at.TEXCOORD_0 !== undefined ? read(at.TEXCOORD_0) : null,
    joints, jointFormat, weights: read(at.WEIGHTS_0), index, indexFormat: index instanceof Uint16Array ? 'uint16' : 'uint32',
    boneNames, ibm, rest, vertexCount: json.accessors[at.POSITION].count,
  };
}

export async function loadSkinnedGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return parseSkinnedGLB(await res.arrayBuffer());
}
