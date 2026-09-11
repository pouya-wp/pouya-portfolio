import * as THREE from 'three';

/* The working surface: a wooden desk, a printed self-healing cutting mat, and the
   handful of tools that always end up on one. Every texture is drawn to a canvas at
   load; nothing is fetched. */

const BONE = '#ffedd7';
const ORANGE = '#dc5000';

const canvasOf = (size: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d')! };
};

const textureOf = (canvas: HTMLCanvasElement, srgb = true, repeat = 1) => {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
};

/* ---------------------------------------------------------------- the desk */

function deskTextures() {
  const { canvas, ctx } = canvasOf(1024);
  const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0, '#4a2f1b');
  grad.addColorStop(.5, '#3b2515');
  grad.addColorStop(1, '#2c1a0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // long grain: many low-contrast strokes with slow vertical drift
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * 1024;
    const w = 40 + Math.random() * 600;
    const x = Math.random() * 1024;
    const light = Math.random() > .55;
    ctx.strokeStyle = light ? `rgba(150,105,64,${.02 + Math.random() * .05})` : `rgba(24,13,6,${.03 + Math.random() * .07})`;
    ctx.lineWidth = .4 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + w * .33, y + (Math.random() - .5) * 7, x + w * .66, y + (Math.random() - .5) * 7, x + w, y + (Math.random() - .5) * 4);
    ctx.stroke();
  }
  // a few knots
  for (let k = 0; k < 5; k++) {
    const cx = Math.random() * 1024, cy = Math.random() * 1024;
    for (let r = 3; r < 30; r += 2.2) {
      ctx.strokeStyle = `rgba(22,12,5,${.16 - r * .004})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * .55, Math.random() * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const rough = canvasOf(512);
  rough.ctx.fillStyle = '#b4b4b4';
  rough.ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.random() * 90;
    rough.ctx.fillStyle = `rgb(${v},${v},${v})`;
    rough.ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1);
  }
  return { map: textureOf(canvas), roughnessMap: textureOf(rough.canvas, false) };
}

export function createDesk() {
  const { map, roughnessMap } = deskTextures();
  map.repeat.set(2.2, 2.2);
  roughnessMap.repeat.set(6, 6);
  const material = new THREE.MeshStandardMaterial({ map, roughnessMap, roughness: .68, metalness: .02 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -2.72;
  mesh.receiveShadow = true;
  return { mesh, material, map, roughnessMap };
}

/* ---------------------------------------------------------- the cutting mat */

function roundedPlane(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const w = width / 2, h = height / 2;
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h); shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius); shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h); shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius); shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) {
    uv.push((position.getX(i) + w) / width, (position.getY(i) + h) / height);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

function matTextures() {
  const S = 2048;
  const { canvas, ctx } = canvasOf(S);

  // base: a green that is darker toward the edges, with a little mottling
  const base = ctx.createLinearGradient(0, 0, S * .7, S);
  base.addColorStop(0, '#4c5b38');
  base.addColorStop(.55, '#445231');
  base.addColorStop(1, '#37452a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 24000; i++) {
    ctx.fillStyle = `rgba(${Math.random() > .5 ? '93,108,73' : '46,58,34'},${Math.random() * .12})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }

  const MARGIN = 96;
  const inner = S - MARGIN * 2;
  const cells = 40;                 // 40 printed squares across the mat
  const step = inner / cells;

  // the printed grid
  for (let n = 0; n <= cells; n++) {
    const v = MARGIN + n * step;
    const major = n % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(255,237,215,.42)' : 'rgba(255,237,215,.15)';
    ctx.lineWidth = major ? 1.7 : .9;
    ctx.beginPath();
    ctx.moveTo(v, MARGIN); ctx.lineTo(v, S - MARGIN);
    ctx.moveTo(MARGIN, v); ctx.lineTo(S - MARGIN, v);
    ctx.stroke();
  }

  // ruler scales along the top and left margins
  ctx.strokeStyle = 'rgba(255,237,215,.6)';
  ctx.fillStyle = 'rgba(255,237,215,.72)';
  ctx.font = '600 20px "DM Sans", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let n = 0; n <= cells * 2; n++) {
    const v = MARGIN + n * step / 2;
    const major = n % 10 === 0, mid = n % 2 === 0;
    const len = major ? 26 : mid ? 16 : 9;
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(v, MARGIN); ctx.lineTo(v, MARGIN - len);
    ctx.moveTo(MARGIN, v); ctx.lineTo(MARGIN - len, v);
    ctx.stroke();
    if (major) {
      ctx.textAlign = 'center';
      ctx.fillText(String(n / 2), v, MARGIN - 40);
      ctx.textAlign = 'right';
      ctx.fillText(String(n / 2), MARGIN - 34, v);
    }
  }

  // angle guides and centring circles
  const cx = S / 2, cy = S / 2;
  ctx.save();
  ctx.setLineDash([12, 9]);
  ctx.strokeStyle = 'rgba(255,237,215,.3)';
  ctx.lineWidth = 1.4;
  for (const deg of [30, 45, 60, 120, 135, 150]) {
    const a = deg * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * inner, cy - Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,237,215,.34)';
  for (const r of [step * 4, step * 8, step * 12]) {
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  // the healed cuts: this mat has been used
  const cuts: [number, number, number, number][] = [];
  for (let i = 0; i < 190; i++) {
    const x = MARGIN + Math.random() * inner, y = MARGIN + Math.random() * inner;
    const a = Math.random() < .55 ? 0 : Math.random() < .5 ? Math.PI / 2 : Math.random() * Math.PI;
    const len = 40 + Math.random() * 460;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    cuts.push([x, y, x2, y2]);
    ctx.strokeStyle = `rgba(122,140,98,${.10 + Math.random() * .2})`;
    ctx.lineWidth = .8 + Math.random() * 1.1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // stamps in the margin
  ctx.fillStyle = 'rgba(255,237,215,.5)';
  ctx.font = '600 26px "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('SELF-HEALING WORKING SURFACE  /  A1  /  SCALE 1:1', MARGIN, S - 42);
  ctx.textAlign = 'right';
  ctx.fillStyle = ORANGE;
  ctx.fillText('PS-04', S - MARGIN, S - 42);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,237,215,.34)';
  ctx.font = '600 22px "DM Sans", system-ui, sans-serif';
  ctx.fillText('SHEET 04 OF 07', MARGIN, 58);

  // edge wear
  const wear = ctx.createRadialGradient(cx, cy, inner * .3, cx, cy, inner * .78);
  wear.addColorStop(0, 'rgba(0,0,0,0)');
  wear.addColorStop(1, 'rgba(10,6,2,.34)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, S, S);

  /* roughness: the printed lines and the healed cuts are duller than the vinyl */
  const rough = canvasOf(1024);
  rough.ctx.fillStyle = '#6e6e6e';
  rough.ctx.fillRect(0, 0, 1024, 1024);
  rough.ctx.strokeStyle = 'rgba(215,215,215,.75)';
  for (const [x, y, x2, y2] of cuts) {
    rough.ctx.lineWidth = 1.6;
    rough.ctx.beginPath();
    rough.ctx.moveTo(x / 2, y / 2); rough.ctx.lineTo(x2 / 2, y2 / 2);
    rough.ctx.stroke();
  }
  for (let i = 0; i < 26000; i++) {
    const v = 90 + Math.random() * 70;
    rough.ctx.fillStyle = `rgb(${v},${v},${v})`;
    rough.ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 1.6, 1.6);
  }

  /* a fine tiling normal map so the vinyl catches the lamp */
  const norm = canvasOf(256);
  const image = norm.ctx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const n = Math.random();
    image.data[i * 4] = 118 + n * 20;
    image.data[i * 4 + 1] = 118 + Math.random() * 20;
    image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = 255;
  }
  norm.ctx.putImageData(image, 0, 0);

  return {
    map: textureOf(canvas),
    roughnessMap: textureOf(rough.canvas, false),
    normalMap: textureOf(norm.canvas, false, 46),
  };
}

export function createMat() {
  const { map, roughnessMap, normalMap } = matTextures();
  const material = new THREE.MeshStandardMaterial({
    map, roughnessMap, normalMap,
    normalScale: new THREE.Vector2(.16, .16),
    roughness: .78, metalness: .0,
  });
  const geometry = roundedPlane(15.4, 15.4, .5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -2.65;
  mesh.receiveShadow = true;
  const texture = map;
  return { mesh, texture, material, geometry, maps: [map, roughnessMap, normalMap] };
}

/* -------------------------------------------------- the room behind the desk */

/** A pale pegboard wall. It is what turns the bench from an object floating in
    black into a room you could actually work in. */
export function createBackWall() {
  const S = 1024;
  const { canvas, ctx } = canvasOf(S);
  const wash = ctx.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, '#efe3cd');
  wash.addColorStop(.62, '#e2d3ba');
  wash.addColorStop(1, '#c9b79a');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, S, S);

  // the peg holes
  const step = 30;
  for (let y = step; y < S; y += step) for (let x = step; x < S; x += step) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 5.4);
    g.addColorStop(0, 'rgba(74,56,36,.62)');
    g.addColorStop(.72, 'rgba(120,96,66,.28)');
    g.addColorStop(1, 'rgba(255,246,232,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,240,.5)';
    ctx.fillRect(x - 2.4, y + 2.6, 4.8, 1.1);
  }
  // grime and a soft occlusion where the wall meets the bench
  for (let i = 0; i < 12000; i++) {
    ctx.fillStyle = `rgba(120,96,66,${Math.random() * .05})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 3, 3);
  }
  const foot = ctx.createLinearGradient(0, S * .8, 0, S);
  foot.addColorStop(0, 'rgba(60,42,26,0)');
  foot.addColorStop(1, 'rgba(60,42,26,.5)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, S * .8, S, S * .2);

  const map = textureOf(canvas);
  map.repeat.set(3.2, 1);
  const material = new THREE.MeshStandardMaterial({ map, roughness: .92, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 22), material);
  mesh.position.set(0, 6.4, -12.5);
  mesh.receiveShadow = true;
  return { mesh, material, map };
}

/* ------------------------------------------------- the plinth for the finale */

/** A bone slab in the dark. The repaired disc stands on it, and the metal that
    runs off it lands here. */
export function createPlinth() {
  const { canvas, ctx } = canvasOf(512);
  ctx.fillStyle = '#d8c8ac';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '128,106,78'},${Math.random() * .10})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  ctx.strokeStyle = 'rgba(56,36,22,.2)';
  ctx.lineWidth = 1;
  for (let n = 0; n <= 16; n++) {
    const v = n * 32;
    ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, 512); ctx.moveTo(0, v); ctx.lineTo(512, v); ctx.stroke();
  }
  const map = textureOf(canvas);
  map.repeat.set(2, 1.4);
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, .26, 2.8),
    new THREE.MeshStandardMaterial({ map, roughness: .82, metalness: .02 }));
  top.position.y = -2.48;
  top.receiveShadow = true;
  top.castShadow = true;
  return { mesh: top, map };
}

/* ------------------------------------------------------ act one: the studio

   Act four is a working bench: a pegboard wall, a cutting mat, tools left where
   they were put down. This is the opposite room and it comes first - the cast has
   not been broken yet, so it is still being photographed rather than repaired.

   A seamless cyclorama, which is the sweep a real sculpture would be shot against:
   the floor curves up into the wall with no corner anywhere, so the background has
   no line in it and reads as light rather than as a surface. That is what makes the
   occlusion under the plinth and the falloff behind the head do all the work. */

export function createCyclorama() {
  /* The sweep is a lathe of an L with its corner rounded off, so wall and floor are
     one surface. Turned only through the back half: nothing behind the camera. */
  // the wall has to run off the top of frame at any of act one's camera distances,
  // or its rim shows as a dark arc across the sky
  const wall = 11, height = 26, fillet = 4.5;
  const profile: THREE.Vector2[] = [];
  /* Floor first, from the centre outwards. The previous profile began at the wall,
     so the lathe produced the sweep and no floor at all - everything inside the
     sweep was a hole, which is what the black under the plinth was. */
  profile.push(new THREE.Vector2(0, 0));
  profile.push(new THREE.Vector2(wall - fillet, 0));
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI / 2;
    profile.push(new THREE.Vector2(
      wall - fillet + Math.sin(a) * fillet,
      fillet - Math.cos(a) * fillet));
  }
  profile.push(new THREE.Vector2(wall, height));

  /* A full revolution. Turning only the back half left no floor on the camera side,
     which is what opened the black wedges along the bottom of frame - the lens sees
     the floor nearest itself first. The wall behind the lens costs a few hundred
     triangles and is never rasterised. */
  const geometry = new THREE.LatheGeometry(profile, 128, 0, Math.PI * 2);
  /* We stand inside this surface, so the inside is the side that must be drawn.
     Mirroring the geometry to achieve that was the wrong tool: a negative scale
     reverses winding but leaves the normals pointing through the surface, and the
     shading then disagreed from one lathe segment to the next - the vertical banding
     that ran the full height of the sweep. BackSide flips the normal in the shader,
     where it belongs, and leaves the geometry honest. */

  const S = 1024;
  const { canvas, ctx } = canvasOf(S);
  const wash = ctx.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, '#fdf6ea');
  wash.addColorStop(.55, '#f4e9d8');
  wash.addColorStop(1, '#e6d7c1');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, S, S);
  // seamless paper has no pattern to speak of; only tooth, or it reads as plastic
  for (let i = 0; i < 42000; i++) {
    ctx.fillStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '150,128,102'},${Math.random() * .05})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const map = textureOf(canvas);
  map.repeat.set(3, 2);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map, roughness: .97, metalness: 0, side: THREE.BackSide,
  }));
  mesh.position.y = -4.07;
  /* The sweep deliberately receives no shadow. Its curve runs almost edge on to the
     key over most of its area, which is the worst case a shadow map can be handed:
     any bias large enough to stop the acne bands it instead, and the whole point of
     a cyclorama is that it carries one clean gradient. That gradient is the falloff
     of the light, not a shadow, so there is nothing here to lose. */
  mesh.receiveShadow = false;
  return { mesh, map };
}

/** The block the cast stands on while it is still whole. */
export function createPedestal() {
  const { canvas, ctx } = canvasOf(512);
  const stone = ctx.createLinearGradient(0, 0, 0, 512);
  stone.addColorStop(0, '#e2d3ba');
  stone.addColorStop(1, '#bda98b');
  ctx.fillStyle = stone;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '132,112,86'},${Math.random() * .09})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // a few long veins, so the block reads as cut stone and not as painted board
  ctx.lineWidth = 1.1;
  for (let n = 0; n < 9; n++) {
    ctx.strokeStyle = `rgba(120,102,80,${.05 + Math.random() * .07})`;
    ctx.beginPath();
    let x = Math.random() * 512, y = -10;
    ctx.moveTo(x, y);
    while (y < 522) { x += (Math.random() - .5) * 46; y += 22 + Math.random() * 26; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const map = textureOf(canvas);

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ map, roughness: .84, metalness: .02 });

  /* A column, not a block. The old one was a short box that stopped in mid air with
     nothing under it - a stone offcut hanging in the room. This one runs all the way
     down past the bottom of frame and into the floor, so wherever the shot is cut it
     is standing on something.

     The profile is a plinth rather than a post: a wide foot, a tapered shaft, a
     cavetto under the top slab. Those three changes of section are the whole reason
     a real pedestal reads as carved and a box does not - each one catches the key at
     a different angle and lays a shadow line under itself. */
  const TOP = -1.75;                       // the base of the cast, in world units
  const piece = (w: number, h: number, y: number, d = w) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.y = y;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  const slab = piece(2.02, .16, TOP - .08);
  const cavetto = piece(1.74, .2, TOP - .26);
  // the shaft is long: it leaves frame and meets the floor, which is at -4.07
  const shaftHeight = 4.2;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(.66, .78, shaftHeight, 4, 1),
    material);
  shaft.position.y = TOP - .36 - shaftHeight / 2;
  shaft.rotation.y = Math.PI / 4;          // square on to the lens, not corner on
  shaft.castShadow = true; shaft.receiveShadow = true;
  const foot = piece(2.24, .3, TOP - .36 - shaftHeight - .15);
  const plate = piece(2.62, .12, TOP - .36 - shaftHeight - .36);

  group.add(slab, cavetto, shaft, foot, plate);
  return { group, map, material };
}

/* ----------------------------------------------- the drafting sheet on top */

function sheetTexture() {
  const S = 2048;
  const { canvas, ctx } = canvasOf(S);
  ctx.fillStyle = '#e7d0ad';
  ctx.fillRect(0, 0, S, S);
  // paper tooth
  for (let i = 0; i < 40000; i++) {
    ctx.fillStyle = `rgba(${Math.random() > .5 ? '255,255,255' : '150,120,90'},${Math.random() * .09})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }

  const M = 84;
  const cx = S / 2, cy = S * .46;

  // the construction: circles, tangents, a radial fan
  ctx.strokeStyle = 'rgba(220,80,0,.22)';
  ctx.lineWidth = 1.2;
  for (const r of [220, 330, 470, 620, 760]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.save();
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = 'rgba(56,36,22,.28)';
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 220, cy + Math.sin(a) * 220);
    ctx.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
    ctx.stroke();
  }
  ctx.restore();

  // a light square grid, heavier every fifth line
  for (let n = 0; n <= 48; n++) {
    const v = M + n * (S - M * 2) / 48;
    ctx.strokeStyle = n % 5 === 0 ? 'rgba(56,36,22,.17)' : 'rgba(56,36,22,.07)';
    ctx.lineWidth = n % 5 === 0 ? 1.3 : .8;
    ctx.beginPath();
    ctx.moveTo(v, M); ctx.lineTo(v, S - M);
    ctx.moveTo(M, v); ctx.lineTo(S - M, v);
    ctx.stroke();
  }

  // border and title block, the way a real sheet is laid out
  ctx.strokeStyle = 'rgba(56,36,22,.55)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(M, M, S - M * 2, S - M * 2);
  ctx.lineWidth = 1.6;
  ctx.strokeRect(M + 14, M + 14, S - (M + 14) * 2, S - (M + 14) * 2);

  const tw = 620, th = 210;
  const tx = S - M - 14 - tw, ty = S - M - 14 - th;
  ctx.fillStyle = 'rgba(246,224,198,.9)';
  ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = 'rgba(56,36,22,.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(tx, ty, tw, th);
  ctx.beginPath();
  ctx.moveTo(tx, ty + 70); ctx.lineTo(tx + tw, ty + 70);
  ctx.moveTo(tx + 360, ty + 70); ctx.lineTo(tx + 360, ty + th);
  ctx.stroke();

  ctx.fillStyle = '#382416';
  ctx.textBaseline = 'middle';
  ctx.font = '600 40px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText('SELECTED WORK', tx + 22, ty + 36);
  ctx.font = '600 22px "DM Sans", system-ui, sans-serif';
  ctx.fillText('SHEET 04 / 07', tx + 22, ty + 108);
  ctx.fillText('SCALE 1 : 1', tx + 22, ty + 152);
  ctx.fillStyle = '#dc5000';
  ctx.fillText('P. SADEGHPOUR', tx + 382, ty + 108);
  ctx.fillStyle = '#382416';
  ctx.fillText('2026 / REV 03', tx + 382, ty + 152);

  // the formulas that actually describe this piece
  ctx.font = '400 30px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(56,36,22,.72)';
  const lines = [
    'PROFILE     r(s) = R (1 - |s|^n)^(1/n)      R = 1.72   n = 4.2',
    'FRACTURE    Vi = { x : ||x - pi|| <= ||x - pj||  for all j }',
    'FALL        y(t) = y0 - g t^2 / 2            e = 0.27',
  ];
  lines.forEach((line, i) => ctx.fillText(line, M + 42, M + 74 + i * 44));

  ctx.font = '600 26px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = '#dc5000';
  ctx.fillText('LIMITATIONS ARE JUST RAW MATERIALS', M + 42, S - M - 58);

  return textureOf(canvas);
}

export function createSheet() {
  const map = sheetTexture();
  const material = new THREE.MeshStandardMaterial({ map, roughness: .97, metalness: 0 });
  const mesh = new THREE.Mesh(roundedPlane(10.8, 10.8, .1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -2.62, 0);
  mesh.receiveShadow = true;
  return { mesh, material, map };
}

/* --------------------------------------------------------- project cards */

export type CardSpec = { number: string; name: string; domain: string; role: string; year: string };

function cardFace(spec: CardSpec) {
  const W = 900, H = 1260;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#100904';
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W * .3, H * .22, 40, W * .5, H * .5, H * .8);
  wash.addColorStop(0, 'rgba(220,80,0,.20)');
  wash.addColorStop(1, 'rgba(16,9,4,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  const M = 54;
  ctx.strokeStyle = 'rgba(220,80,0,.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(M, M, W - M * 2, H - M * 2);
  ctx.strokeStyle = 'rgba(255,237,215,.16)';
  ctx.lineWidth = 1;
  for (let n = 1; n < 12; n++) {
    const v = M + n * (W - M * 2) / 12;
    ctx.beginPath(); ctx.moveTo(v, M); ctx.lineTo(v, H - M); ctx.stroke();
  }
  for (let n = 1; n < 17; n++) {
    const v = M + n * (H - M * 2) / 17;
    ctx.beginPath(); ctx.moveTo(M, v); ctx.lineTo(W - M, v); ctx.stroke();
  }

  // a drawing of the thing: nested arcs and a construction cross
  const cx = W / 2, cy = H * .44;
  ctx.strokeStyle = 'rgba(220,80,0,.85)';
  ctx.lineWidth = 2.4;
  for (const r of [110, 180, 250]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(255,237,215,.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 320, cy); ctx.lineTo(cx + 320, cy);
  ctx.moveTo(cx, cy - 320); ctx.lineTo(cx, cy + 320);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,237,215,.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, -Math.PI * .18, Math.PI * .42);
  ctx.stroke();

  ctx.fillStyle = '#ffedd7';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 26px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = '#dc5000';
  ctx.fillText(`DRAWING ${spec.number}`, M + 26, M + 62);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,237,215,.6)';
  ctx.fillText(spec.year, W - M - 26, M + 62);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#ffedd7';
  ctx.font = '600 108px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(spec.name.toUpperCase(), M + 26, H - M - 148);
  ctx.font = '400 30px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,237,215,.55)';
  ctx.fillText(spec.domain, M + 26, H - M - 96);
  ctx.fillStyle = '#dc5000';
  ctx.font = '600 26px "DM Sans", system-ui, sans-serif';
  ctx.fillText(spec.role.toUpperCase(), M + 26, H - M - 46);

  return textureOf(canvas);
}

function cardBack() {
  const canvas = document.createElement('canvas');
  canvas.width = 450; canvas.height = 630;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#382416';
  ctx.fillRect(0, 0, 450, 630);
  ctx.strokeStyle = 'rgba(255,237,215,.22)';
  ctx.lineWidth = 1;
  for (let x = -630; x < 450; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 630, 630); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(220,80,0,.8)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 402, 582);
  ctx.fillStyle = '#ffedd7';
  ctx.font = '600 74px "Space Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PS', 225, 345);
  return textureOf(canvas);
}

const CARD = { width: 2.55, height: 3.57, depth: .05 };

/** One project, as a card dealt onto the sheet. */
export function createProjectCard(spec: CardSpec) {
  const group = new THREE.Group();
  const front = cardFace(spec);
  const back = cardBack();

  const body = new THREE.Mesh(
    roundedPlane(CARD.width, CARD.height, .14),
    new THREE.MeshStandardMaterial({ map: front, roughness: .52, metalness: .04 }));
  body.position.z = CARD.depth / 2 + .004;
  const reverse = new THREE.Mesh(
    roundedPlane(CARD.width, CARD.height, .14),
    new THREE.MeshStandardMaterial({ map: back, roughness: .62, metalness: .04 }));
  reverse.position.z = -CARD.depth / 2 - .004;
  reverse.rotation.y = Math.PI;

  const shape = new THREE.Shape();
  const w = CARD.width / 2, h = CARD.height / 2, r = .14;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h); shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: CARD.depth, bevelEnabled: false, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({ color: 0xe6d5bb, roughness: .8, metalness: 0 }));
  edge.position.z = -CARD.depth / 2;

  group.add(edge, body, reverse);
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // lie flat on the table by default
  group.rotation.x = -Math.PI / 2;
  return { group, maps: [front, back] };
}

/* -------------------------------------------------------------- the tools */

const steel = () => new THREE.MeshStandardMaterial({ color: 0xb9bec2, metalness: .95, roughness: .22 });
const paint = (color: number, roughness = .42) => new THREE.MeshStandardMaterial({ color, metalness: .05, roughness });

function markAllShadows(group: THREE.Object3D) {
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

/** A snap-off blade knife, the tool this whole piece is really about. */
export function createCutter() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.2, .115, 1.25), paint(0xdc5000, .34));
  body.geometry.translate(0, 0, 0);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.CylinderGeometry(.058, .058, 1.25, 14, 1, false), paint(0xb33f00, .38));
  belly.rotation.x = Math.PI / 2;
  belly.position.y = -.055;
  group.add(belly);

  const channel = new THREE.Mesh(new THREE.BoxGeometry(.135, .036, .96), paint(0x2a1a10, .55));
  channel.position.set(0, .06, .06);
  group.add(channel);

  for (let i = 0; i < 9; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(.19, .016, .022), paint(0xb33f00, .5));
    rib.position.set(0, .062, -.34 + i * .075);
    group.add(rib);
  }

  const track = new THREE.Mesh(new THREE.BoxGeometry(.145, .022, 1.16), steel());
  track.position.set(0, .045, 0);
  group.add(track);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(.115, .0165, .62), steel());
  blade.position.set(0, .045, -.78);
  group.add(blade);
  // the snap-off scoring lines
  for (let i = 0; i < 4; i++) {
    const score = new THREE.Mesh(new THREE.BoxGeometry(.118, .019, .006), paint(0x6d7276, .3));
    score.position.set(0, .045, -.56 - i * .145);
    group.add(score);
  }
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.118, .004, .62), paint(0xe8e6e0, .12));
  edge.position.set(0, .036, -.78);
  group.add(edge);

  const slider = new THREE.Mesh(new THREE.BoxGeometry(.085, .052, .17), paint(0x1d150e, .35));
  slider.position.set(0, .082, .2);
  group.add(slider);

  group.position.set(4.15, -2.585, -.55);
  group.rotation.y = -.45;
  markAllShadows(group);
  return group;
}

/** A hexagonal pencil, sharpened. */
export function createPencil() {
  const group = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 1.75, 6), paint(0xd8b23f, .38));
  barrel.rotation.z = Math.PI / 2;
  group.add(barrel);
  const wood = new THREE.Mesh(new THREE.ConeGeometry(.055, .21, 6), paint(0xe6d3ac, .55));
  wood.rotation.z = -Math.PI / 2;
  wood.position.x = -.98;
  group.add(wood);
  const lead = new THREE.Mesh(new THREE.ConeGeometry(.019, .07, 8), paint(0x16120e, .5));
  lead.rotation.z = -Math.PI / 2;
  lead.position.x = -1.11;
  group.add(lead);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(.058, .058, .17, 12), steel());
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.x = .92;
  group.add(ferrule);
  const eraser = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .1, 12), paint(0xd06a5a, .8));
  eraser.rotation.z = Math.PI / 2;
  eraser.position.x = 1.05;
  group.add(eraser);
  markAllShadows(group);
  return group;
}

/** A bent-wire paper clip. */
export function createClip() {
  const points: THREE.Vector3[] = [];
  const push = (x: number, y: number) => points.push(new THREE.Vector3(x, 0, y));
  push(-.02, -.28); push(-.02, .2);
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); push(-.02 + Math.sin(a) * .07, .2 + Math.cos(a) * -.07 + .07); }
  push(.05, -.2);
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); push(.05 + Math.sin(a) * .05, -.2 + Math.cos(a) * .05 - .05); }
  push(.1, .16);
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, .014, 7, false), steel());
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** A soft block eraser. */
export function createEraser() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.42, .12, .22), paint(0xf1e6d2, .92));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------ particles and type */

export function textSamples(text: string, count: number, random: () => number, width = 8, height = 3.2,
  font = '600 88px "Space Grotesk", system-ui, sans-serif') {
  const { canvas, ctx } = canvasOf(1400);
  canvas.height = 600;
  ctx.font = font;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((line, i) => ctx.fillText(line, 700, 300 + (i - (lines.length - 1) / 2) * 115));
  const data = ctx.getImageData(0, 0, 1400, 600).data;
  const points: number[] = [];
  // a two pixel stride: at 88px type a stroke is about ten across, and three was
  // giving barely three candidates through the waist of a letter
  for (let y = 0; y < 600; y += 2) for (let x = 0; x < 1400; x += 2) {
    if (data[(y * 1400 + x) * 4 + 3] > 100) points.push(x, y);
  }

  /* Deal the particles out, do not draw them with replacement.

     Picking a random candidate per particle is the obvious way and it is why the
     type had holes in it. With replacement, coverage is Poisson: at one particle
     per candidate roughly a third of the candidates get none at all, and those
     gaps land in the middle of strokes. Shuffling the candidates once and then
     walking them in order guarantees every position is used before any position is
     used twice, so a stroke fills in completely and the leftovers thicken it
     evenly rather than clumping. Same particle count, legible result. */
  const n = points.length / 2;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    const t = order[i]; order[i] = order[k]; order[k] = t;
  }

  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const j = order[i % n] * 2;
    // a sub-candidate jitter, so the second pass over the list does not simply
    // stack a duplicate on top of the first
    const spread = i < n ? 0 : 1;
    out[i * 3] = ((points[j] + (random() - .5) * 2 * spread) / 1400 - .5) * width;
    out[i * 3 + 1] = (.5 - (points[j + 1] + (random() - .5) * 2 * spread) / 600) * height;
    out[i * 3 + 2] = (random() - .5) * .035;
  }
  return out;
}

/* A cloud that can hold three shapes at once: where it rests, the phrase it is
   leaving, and the phrase it is arriving at. Points cross over on their own
   staggered clock and swing out along an arc on the way, so a phrase change reads
   as the cloud rewriting itself rather than a cut. */
export function makeParticles(home: Float32Array, text: Float32Array) {
  const count = home.length / 3;
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(home, 3));
  geometry.setAttribute('aText', new THREE.BufferAttribute(text.slice(), 3));
  geometry.setAttribute('aWas', new THREE.BufferAttribute(text.slice(), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uMorph: { value: 0 }, uBlend: { value: 1 }, uOpacity: { value: 0 }, uTime: { value: 0 },
      /* 0..1, raised while the cloud is the whole frame - see below */
      uBoost: { value: 0 },
      uPointer: { value: new THREE.Vector2() }, uPixel: { value: Math.min(devicePixelRatio, 1.7) },
      uWarm: { value: new THREE.Color('#ff8a3d') }, uCool: { value: new THREE.Color('#ffedd7') },
    },
    vertexShader: `
      attribute vec3 aText;
      attribute vec3 aWas;
      attribute float aSeed;
      uniform float uMorph, uBlend, uTime, uPixel, uBoost;
      uniform vec2 uPointer;
      varying float vHeat; varying float vFade;
      void main(){
        float t = clamp((uBlend - aSeed * .42) / .58, 0., 1.);
        t = t * t * (3. - 2. * t);
        vec3 target = mix(aWas, aText, t);
        // the swing: points bow outward at the midpoint of their crossing
        float swing = sin(t * 3.14159265);
        target += normalize(vec3(sin(aSeed * 41.7), cos(aSeed * 23.1), sin(aSeed * 11.3) * .6))
                  * swing * .62;

        vec3 p = mix(position, target, uMorph);
        float d = length(p.xy - uPointer * 2.);
        p.x += sin(p.y * 3. + uTime * .5) * .04 * (1. - uMorph);
        p.z += sin(p.x * 2. + uTime * .4) * .13 * (1. - uMorph);
        p.xy += (p.xy - uPointer * 2.) * .026 * exp(-d * d) * sin(uTime);

        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        /* While the cloud is carrying a sentence it has to be read, not admired.
           Points that are fine as a haze around a solid object are far too thin to
           hold a letterform: a stroke ends up one dot wide with gaps in it. The boost
           widens them and, more to the point, raises the ceiling - the old clamp at
           3.4 was what actually capped legibility, not the size term. */
        gl_PointSize = clamp((15. + swing * 7.) * (1. + uBoost * .5) * uPixel / -mv.z,
                             1.1, 3.4 + uBoost * 2.6);
        vHeat = swing;
        vFade = .72 + .28 * sin(aSeed * 60. + uTime * .7);
      }`,
    fragmentShader: `
      uniform float uOpacity, uBoost; uniform vec3 uWarm, uCool;
      varying float vHeat; varying float vFade;
      void main(){
        vec2 q = gl_PointCoord - .5;
        float d = length(q);
        if(d > .5) discard;
        /* The falloff softens as the boost comes up. At 2.4 almost all of a point's
           area is nearly transparent, which is what a dust mote should look like and
           is hopeless for type. */
        float core = pow(1. - smoothstep(0., .5, d), mix(2.4, 1.35, uBoost));
        vec3 tint = mix(uCool, uWarm, clamp(vHeat * 1.2, 0., 1.));
        /* vFade twinkles each point between .44 and 1. Across a sentence that means
           half the strokes are half gone at any instant, which reads as a smudge
           rather than as life. The twinkle is held back while it is being read. */
        float fade = mix(vFade, .92 + vFade * .08, uBoost);
        gl_FragColor = vec4(tint * (.85 + core * 1.35) * (1. + uBoost * .55),
                            core * fade * uOpacity);
      }`,
  });
  return new THREE.Points(geometry, material);
}

/* ============================================================================
   THE BOARD

   The last act is a chess set, and the repaired cast takes the white king's
   square. The pieces are turned rather than modelled: a profile revolved on the
   lathe is exactly how a real set is made on a machine, so it is also the honest
   way to make one here. The knight gets a wedge instead of a horse, which keeps
   the set reading as a designed object rather than a bad carving.
   ========================================================================= */

export const BOARD = {
  /** width of one square */
  square: 1.5,
  /** top surface of the board */
  top: -2.45,
  thickness: .34,
};

/** File and rank to a world position on the board. White's back rank is nearest. */
export function squareAt(file: number, rank: number): THREE.Vector3 {
  return new THREE.Vector3(
    (file - 3.5) * BOARD.square,
    BOARD.top,
    (3.5 - rank) * BOARD.square);
}

function boardTexture() {
  const S = 2048;
  const { canvas, ctx } = canvasOf(S);
  const cell = S / 8;

  for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
    const lightSquare = (file + rank) % 2 === 0;
    const x = file * cell, y = rank * cell;
    // no square on a real board is one flat colour: each is a slab of its own
    const wash = ctx.createLinearGradient(x, y, x + cell, y + cell);
    if (lightSquare) { wash.addColorStop(0, '#efe3ca'); wash.addColorStop(1, '#dccdae'); }
    else { wash.addColorStop(0, '#3b2c1d'); wash.addColorStop(1, '#241a11'); }
    ctx.fillStyle = wash;
    ctx.fillRect(x, y, cell, cell);

    // grain runs along the slab
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, cell, cell); ctx.clip();
    const along = (file + rank) % 4 < 2;
    for (let i = 0; i < 130; i++) {
      const t = Math.random();
      ctx.strokeStyle = lightSquare
        ? `rgba(${Math.random() > .5 ? '255,250,238' : '150,124,88'},${.03 + Math.random() * .06})`
        : `rgba(${Math.random() > .5 ? '108,80,50' : '14,9,5'},${.05 + Math.random() * .09})`;
      ctx.lineWidth = .6 + Math.random() * 2.4;
      ctx.beginPath();
      if (along) { ctx.moveTo(x, y + t * cell); ctx.lineTo(x + cell, y + t * cell + (Math.random() - .5) * 12); }
      else { ctx.moveTo(x + t * cell, y); ctx.lineTo(x + t * cell + (Math.random() - .5) * 12, y + cell); }
      ctx.stroke();
    }
    ctx.restore();
    // the joint between slabs
    ctx.strokeStyle = 'rgba(24,15,8,.42)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
  }

  // years of hands: the middle of the board is worn lighter than the corners
  const wear = ctx.createRadialGradient(S / 2, S / 2, S * .1, S / 2, S / 2, S * .72);
  wear.addColorStop(0, 'rgba(255,244,224,.07)');
  wear.addColorStop(1, 'rgba(18,11,6,.22)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, S, S);

  /* roughness: lacquer sits differently on the two woods, and the worn middle is
     duller than the edges */
  const rough = canvasOf(1024);
  for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
    const lightSquare = (file + rank) % 2 === 0;
    rough.ctx.fillStyle = lightSquare ? '#5c5c5c' : '#727272';
    rough.ctx.fillRect(file * 128, rank * 128, 128, 128);
  }
  for (let i = 0; i < 26000; i++) {
    const v = 90 + Math.random() * 90;
    rough.ctx.fillStyle = `rgb(${v},${v},${v})`;
    rough.ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  const middle = rough.ctx.createRadialGradient(512, 512, 60, 512, 512, 460);
  middle.addColorStop(0, 'rgba(190,190,190,.5)');
  middle.addColorStop(1, 'rgba(190,190,190,0)');
  rough.ctx.fillStyle = middle;
  rough.ctx.fillRect(0, 0, 1024, 1024);

  const norm = canvasOf(256);
  const image = norm.ctx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    image.data[i * 4] = 122 + Math.random() * 12;
    image.data[i * 4 + 1] = 122 + Math.random() * 12;
    image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = 255;
  }
  norm.ctx.putImageData(image, 0, 0);

  return {
    map: textureOf(canvas),
    roughnessMap: textureOf(rough.canvas, false),
    normalMap: textureOf(norm.canvas, false, 22),
  };
}

/** The frame the playing field is set into: quarter-sawn, darker, with the
    coordinates burned along two edges. */
function frameTexture() {
  const S = 1024;
  const { canvas, ctx } = canvasOf(S);
  const wash = ctx.createLinearGradient(0, 0, S, S);
  wash.addColorStop(0, '#43301d');
  wash.addColorStop(.5, '#33230f');
  wash.addColorStop(1, '#251808');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 3200; i++) {
    const y = Math.random() * S, w = 60 + Math.random() * 700, x = Math.random() * S;
    ctx.strokeStyle = Math.random() > .5
      ? `rgba(150,110,66,${.02 + Math.random() * .05})`
      : `rgba(18,10,4,${.04 + Math.random() * .08})`;
    ctx.lineWidth = .4 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + w * .3, y + (Math.random() - .5) * 6, x + w * .7, y + (Math.random() - .5) * 6, x + w, y);
    ctx.stroke();
  }
  return textureOf(canvas);
}

type Profile = [number, number][];

const PIECES: Record<string, { profile: Profile; height: number }> = {
  pawn: {
    height: 1.02,
    profile: [[0, 0], [.31, 0], [.32, .06], [.28, .12], [.19, .19], [.13, .35],
    [.19, .43], [.17, .50], [.11, .55], [.12, .62], [.22, .72], [.21, .82],
    [.15, .94], [.07, 1.01], [0, 1.02]],
  },
  rook: {
    height: 1.24,
    profile: [[0, 0], [.35, 0], [.36, .07], [.31, .14], [.21, .23], [.17, .72],
    [.22, .80], [.29, .88], [.30, 1.12], [.27, 1.20], [.19, 1.24], [0, 1.24]],
  },
  knight: {
    height: 1.52,
    profile: [[0, 0], [.34, 0], [.35, .07], [.30, .14], [.20, .23], [.15, .56],
    [.19, .67], [.16, .76], [.12, .87], [0, .94]],
  },
  bishop: {
    height: 1.57,
    profile: [[0, 0], [.34, 0], [.35, .07], [.30, .14], [.20, .23], [.14, .62],
    [.22, .72], [.22, .79], [.14, .86], [.13, .94], [.16, 1.00], [0, 1.04]],
  },
  queen: {
    height: 1.68,
    profile: [[0, 0], [.37, 0], [.38, .08], [.32, .16], [.21, .27], [.15, .73],
    [.24, .84], [.24, .91], [.15, .98], [.14, 1.08], [.31, 1.28], [.30, 1.36],
    [.23, 1.44], [.15, 1.51], [.17, 1.59], [.09, 1.67], [0, 1.68]],
  },
  king: {
    height: 1.86,
    profile: [[0, 0], [.37, 0], [.37, .08], [.31, .15], [.21, .27], [.15, .78],
    [.245, .89], [.245, .95], [.15, 1.01], [.14, 1.12], [.31, 1.34], [.31, 1.42],
    [.23, 1.52], [.15, 1.60], [.15, 1.86], [0, 1.86]],
  },
};

/** Two Chaikin passes keep the lathed silhouettes manufactured and precise while
 * removing the low-poly corners that made the set read like rough placeholders. */
function roundedProfile(profile: Profile, passes = 2): THREE.Vector2[] {
  let points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  for (let pass = 0; pass < passes; pass++) {
    const rounded = [points[0].clone()];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      rounded.push(a.clone().multiplyScalar(.75).addScaledVector(b, .25));
      rounded.push(a.clone().multiplyScalar(.25).addScaledVector(b, .75));
    }
    rounded.push(points[points.length - 1].clone());
    points = rounded;
  }
  return points;
}

function turnPiece(kind: keyof typeof PIECES, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const { profile } = PIECES[kind];
  const geometry = new THREE.LatheGeometry(roundedProfile(profile), 72);
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, material));

  if (kind === 'knight') {
    // A compact, fully rounded horse silhouette: curved neck, soft head, muzzle
    // and paired ears. It keeps the modern set language without the old box wedge.
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.14, .43, 9, 28), material);
    neck.position.set(0, 1.03, .055); neck.rotation.x = .43;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 36, 24), material);
    head.position.set(0, 1.34, .18); head.scale.set(.78, 1.08, 1.0);
    const muzzle = new THREE.Mesh(new THREE.CapsuleGeometry(.105, .17, 8, 24), material);
    muzzle.position.set(0, 1.31, .39); muzzle.rotation.x = Math.PI / 2;
    const earA = new THREE.Mesh(new THREE.ConeGeometry(.065, .20, 20), material);
    const earB = earA.clone();
    earA.position.set(-.09, 1.57, .12); earA.rotation.x = -.14; earA.rotation.z = .08;
    earB.position.set(.09, 1.57, .12); earB.rotation.x = -.14; earB.rotation.z = -.08;
    group.add(neck, head, muzzle, earA, earB);
  }
  if (kind === 'bishop') {
    // Build the mitre as real cut geometry. Triangles inside the diagonal band
    // are removed through the full depth of the crown, so the background is
    // visible through the slot instead of a dark box pretending to be a cut.
    const source = new THREE.SphereGeometry(.25, 48, 32).toNonIndexed();
    source.scale(.9, 1.22, .9);
    source.translate(0, 1.28, 0);
    const position = source.getAttribute('position');
    const kept: number[] = [];
    for (let i = 0; i < position.count; i += 3) {
      const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
      const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
      const inMitreCut = cy > 1.12 && Math.abs((cy - 1.31) + cx * .92) < .052;
      if (inMitreCut) continue;
      for (let v = i; v < i + 3; v++) kept.push(position.getX(v), position.getY(v), position.getZ(v));
    }
    const crownGeometry = new THREE.BufferGeometry();
    crownGeometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    crownGeometry.computeVertexNormals();
    source.dispose();
    group.add(new THREE.Mesh(crownGeometry, material));
  }
  if (kind === 'queen') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.085, 28, 18), material);
    crown.position.y = 1.68;
    group.add(crown);
  }
  if (kind === 'king') {
    const upright = new THREE.Mesh(new THREE.CapsuleGeometry(.043, .25, 7, 16), material);
    upright.position.y = 2.0;
    const cross = new THREE.Mesh(new THREE.CapsuleGeometry(.043, .16, 7, 16), material);
    cross.position.y = 2.03;
    cross.rotation.z = Math.PI / 2;
    group.add(upright, cross);
  }
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

const BACK_RANK: (keyof typeof PIECES)[] =
  ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

/* A turned piece is not plastic: the lathe leaves fine rings all the way up it, the
   polish sits differently in those rings, and the stone underneath is never one
   colour. All three are keyed on the piece's own local height, so every piece is
   turned the same way and no two look identical. */
function turnedMaterial(colour: number, dark: boolean) {
  const material = new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: dark ? .34 : .46,
    metalness: 0,
    clearcoat: dark ? .5 : .32,
    clearcoatRoughness: dark ? .22 : .38,
    sheen: dark ? .1 : .3,
    sheenRoughness: .7,
    sheenColor: new THREE.Color(dark ? 0x6a4c2c : 0xfff3df),
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vTurn;
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      vTurn = position;`);
    shader.fragmentShader = `varying vec3 vTurn;
float turnHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float rings = sin(vTurn.y * 210.) * .5 + .5;
      float coarse = sin(vTurn.y * 27. + turnHash(vTurn.xz * 40.) * 2.) * .5 + .5;
      float fleck = turnHash(floor(vTurn.xz * 340.) + floor(vTurn.y * 340.));
      diffuseColor.rgb *= .93 + rings * .045 + coarse * .07 + fleck * .04;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // the polish catches in the turning rings, which is the whole look of a turned piece
      roughnessFactor *= .78 + (sin(vTurn.y * 210.) * .5 + .5) * .5;`);
  };
  return material;
}

/** The whole set. The white king is left out: the cast stands on that square. */
/** The whole set. The white king is left out: the cast stands on that square. */
export function createChessSet(_unused?: THREE.Material) {
  const { map, roughnessMap, normalMap } = boardTexture();
  const frameMap = frameTexture();
  frameMap.repeat.set(4, 1);

  const field = BOARD.square * 8;
  const boardMaterial = new THREE.MeshPhysicalMaterial({
    map, roughnessMap, normalMap,
    normalScale: new THREE.Vector2(.22, .22),
    roughness: .5, metalness: 0,
    clearcoat: .55, clearcoatRoughness: .3,
  });
  const frameMaterial = new THREE.MeshPhysicalMaterial({
    map: frameMap, roughness: .46, metalness: 0,
    clearcoat: .4, clearcoatRoughness: .35,
  });

  // a frame the playing field is set into, so the board has a real edge
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(field + 1.5, BOARD.thickness, field + 1.5), frameMaterial);
  frame.position.y = BOARD.top - BOARD.thickness / 2 - .015;
  frame.receiveShadow = true;
  frame.castShadow = true;

  const board = new THREE.Mesh(new THREE.BoxGeometry(field, .09, field), boardMaterial);
  board.position.y = BOARD.top - .045;
  board.receiveShadow = true;

  const whiteMaterial = turnedMaterial(0xe9dcc2, false);
  const dark = turnedMaterial(0x2a1c10, true);

  const group = new THREE.Group();
  group.add(frame, board);

  const place = (piece: THREE.Group, file: number, rank: number, facing: number) => {
    piece.position.copy(squareAt(file, rank));
    piece.rotation.y = facing + (Math.random() - .5) * .18;
    group.add(piece);
  };

  for (let file = 0; file < 8; file++) {
    place(turnPiece('pawn', whiteMaterial), file, 1, 0);
    place(turnPiece('pawn', dark), file, 6, Math.PI);
    place(turnPiece(BACK_RANK[file], dark), file, 7, Math.PI);
    // file 4 is the white king's square, and it stays empty for the cast
    if (file !== 4) place(turnPiece(BACK_RANK[file], whiteMaterial), file, 0, 0);
  }

  return { group, board, map, maps: [map, roughnessMap, normalMap, frameMap], dark, whiteMaterial, boardMaterial,
    kingSquare: squareAt(4, 0), kingHeight: PIECES.king.height };
}
