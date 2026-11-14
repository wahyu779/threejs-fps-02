// Peta "Pelabuhan Senja": halaman pelabuhan tua 40 x 40 m di senja hari.
// Dua jalur (barat/timur) plus tengah lewat gudang, dua situs bom A (barat laut)
// dan B (timur laut), spawn Penjaga di selatan dan Penyusup di utara.
// Semua geometri kotak polos tanpa tekstur; collider dan permukaan tembak
// dibangun bersama mesh-nya supaya peluru dan kaki selalu sepakat.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HALF = 20;

// Graf waypoint: simpul jalan yang dipakai bot. Tepi = jalan yang bisa dilewati.
export const WAYPOINTS = [
  // id: 0-2 spawn Penyusup (utara), 3-5 spawn Penjaga (selatan)
  { x: -6, z: -18 }, { x: 0, z: -18 }, { x: 6, z: -18 },
  { x: -4, z: 16 }, { x: 0, z: 16 }, { x: 4, z: 16 },
  // jalur barat menuju A
  { x: -13, z: -12 }, { x: -15, z: -5 }, { x: -14, z: 3 }, { x: -12, z: 10 },
  // jalur timur menuju B
  { x: 13, z: -12 }, { x: 15, z: -5 }, { x: 14, z: 3 }, { x: 12, z: 10 },
  // tengah lewat gudang
  { x: 0, z: -11 }, { x: 0, z: -4 }, { x: 0, z: 4 }, { x: 0, z: 11 },
  // situs dan persimpangan utara
  { x: -15, z: -15 }, { x: 15, z: -15 }, { x: -8, z: -14 }, { x: 8, z: -14 },
  // titik jaga Penjaga
  { x: -11, z: -8 }, { x: 11, z: -8 }, { x: -9, z: 6 }, { x: 9, z: 6 },
];

const EDGES = [
  [0, 21], [1, 15], [2, 22], [0, 6], [2, 10], [1, 14],
  [6, 20], [6, 7], [7, 8], [8, 9], [9, 3], [8, 24], [9, 25],
  [10, 21], [10, 11], [11, 12], [12, 13], [13, 5], [12, 26], [13, 27],
  [14, 15], [14, 21], [14, 22], [15, 16], [16, 17], [17, 4], [16, 24], [16, 26],
  [20, 23], [21, 23], [23, 7], [24, 22], [24, 7], [25, 26], [25, 11],
  [3, 25], [5, 27], [17, 27], [17, 25], [20, 6], [21, 10],
];

export const SITES = {
  A: { id: 'A', x: -15, z: -15, radius: 3.4 },
  B: { id: 'B', x: 15, z: -15, radius: 3.4 },
};

export const SPAWNS = {
  defender: [[-4, 16], [0, 16], [4, 16]],
  attacker: [[-6, -18], [0, -18], [6, -18]],
};

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Breadth-first search di graf waypoint; kembalikan daftar simpul dari awal ke tujuan.
export function findPath(fromIndex, toIndex) {
  if (fromIndex === toIndex) return [toIndex];
  const cameFrom = new Array(WAYPOINTS.length).fill(-1);
  const queue = [fromIndex];
  cameFrom[fromIndex] = fromIndex;
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [a, b] of EDGES) {
      const next = a === current ? b : b === current ? a : -1;
      if (next === -1 || cameFrom[next] !== -1) continue;
      cameFrom[next] = current;
      if (next === toIndex) {
        const path = [toIndex];
        let node = toIndex;
        while (node !== fromIndex) { node = cameFrom[node]; path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [toIndex];
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'ink' ? 0.55 : 0.94,
      metalness: name === 'rust' || name === 'teal' ? 0.25 : 0.03,
    });
  }

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(r, h, x, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), materials[mat]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Tanah dan tembok keliling (tinggi 5 m, terbuka ke langit senja).
  box(41, 0.4, 41, 0, -0.2, 0, 'ground');
  box(0.5, 5, 41, -HALF - 0.25, 2.5, 0, 'wall');
  box(0.5, 5, 41, HALF + 0.25, 2.5, 0, 'wall');
  box(41, 5, 0.5, 0, 2.5, -HALF - 0.25, 'wall');
  box(41, 5, 0.5, 0, 2.5, HALF + 0.25, 'wall');

  // Gudang tengah: dua dinding dengan celah pintu di tengah dan di sisi.
  box(3.2, 3.4, 0.6, -4.6, 1.7, -4, 'concrete');
  box(3.2, 3.4, 0.6, 4.6, 1.7, -4, 'concrete');
  box(12.4, 1.0, 0.6, 0, 3.9, -4, 'concrete');
  box(3.2, 3.4, 0.6, -4.6, 1.7, 4, 'concrete');
  box(3.2, 3.4, 0.6, 4.6, 1.7, 4, 'concrete');
  box(3.2, 1.0, 0.6, 0, 3.9, 4, 'concrete');
  box(0.6, 3.4, 7.6, -6.2, 1.7, 0, 'concrete');
  box(0.6, 3.4, 7.6, 6.2, 1.7, 0, 'concrete');
  box(12.4, 0.5, 7.6, 0, 4.6, 0, 'rust'); // atap gudang

  // Kontainer besar: penghalang tinggi di kedua jalur.
  box(5.2, 2.6, 2.4, -13, 1.3, -8, 'teal');
  box(5.2, 2.6, 2.4, 13, 1.3, -8, 'rust');
  box(2.4, 2.6, 5.2, -16, 1.3, 6, 'rust');
  box(2.4, 2.6, 5.2, 16, 1.3, 6, 'teal');

  // Peti kayu: perlindungan setinggi dada di jalur dan tengah.
  box(1.3, 1.15, 1.3, -8, 0.58, -11, 'wood');
  box(1.3, 1.15, 1.3, 8, 0.58, -11, 'wood');
  box(1.3, 1.15, 1.3, -9, 0.58, 0, 'wood');
  box(1.3, 1.15, 1.3, 9, 0.58, 0, 'wood');
  box(1.3, 1.15, 1.3, -4, 0.58, 8, 'wood');
  box(1.3, 1.15, 1.3, 4, 0.58, 8, 'wood');
  box(1.3, 2.3, 1.3, -11, 1.15, -14, 'wood');
  box(1.3, 2.3, 1.3, 11, 1.15, -14, 'wood');
  box(2.6, 1.15, 1.3, 0, 0.58, -15.5, 'wood');
  box(1.3, 1.15, 2.6, -17.5, 0.58, -10, 'wood');
  box(1.3, 1.15, 2.6, 17.5, 0.58, -10, 'wood');

  // Drum-drum di sudut dan dekat situs.
  cylinder(0.55, 1.1, -18, -18, 'rust');
  cylinder(0.55, 1.1, -17, -17, 'teal');
  cylinder(0.55, 1.1, 18, -18, 'teal');
  cylinder(0.55, 1.1, 17, -17, 'rust');
  cylinder(0.55, 1.1, -18, 12, 'teal');
  cylinder(0.55, 1.1, 18, 12, 'rust');

  // Tanda situs: lantai berwarna + papan huruf A / B yang berdiri.
  for (const site of Object.values(SITES)) {
    const pad = box(5.0, 0.06, 5.0, site.x, 0.03, site.z, 'site', false);
    pad.receiveShadow = true;
    box(2.2, 1.4, 0.18, site.x, 3.6, -19.4, 'concrete');
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#232733';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(site.id, 64, 68);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.6 }),
    );
    letter.position.set(site.x, 3.6, -19.28);
    group.add(letter);
    shootables.push(letter);
  }

  // Menara lampu sudut: tiang + kepala lampu yang menyala.
  const lampHeads = [];
  for (const [lx, lz] of [[-18, 18], [18, 18], [-18, -18], [18, -18]]) {
    box(0.3, 6, 0.3, lx, 3, lz, 'concrete');
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.9),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.6 }),
    );
    head.position.set(lx, 6.1, lz);
    group.add(head);
    lampHeads.push(new THREE.Vector3(lx, 6.1, lz));
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.dusk), 14, 22, 1.6);
    glow.position.set(lx, 5.8, lz);
    scene.add(glow);
  }

  // Cahaya senja: matahari rendah dari barat (oranye hangat), langit biru dingin.
  const sky = new THREE.HemisphereLight(new THREE.Color('#aab8d8'), new THREE.Color(PALETTE.ground), 2.1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.dusk), 2.8);
  sun.position.set(-26, 12, 8);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8fb5'), 1.2);
  fill.position.set(14, 10, 16);
  scene.add(fill);

  // Dua lampu hangat di dalam gudang supaya interior tidak hitam.
  for (const lx of [-3, 3]) {
    const warm = new THREE.PointLight(new THREE.Color('#ffb45e'), 22, 16, 1.5);
    warm.position.set(lx, 3.6, 0);
    scene.add(warm);
  }

  return { colliders, shootables, group, lampHeads };
}
