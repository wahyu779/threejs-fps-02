// Bom: dibawa satu pembawa, ditanam di situs A/B (tahan E 3 dtk),
// sumbu 40 dtk, dijinakkan dengan tahan E 5 dtk, meledak dalam radius.
// Keadaan bom tinggal di satu tempat ini; main.js hanya memanggil step().
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const FUSE_TIME = 40;
const BLAST_RADIUS = 9;

export function createBomb(scene) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 }),
  );
  body.position.y = 0.11;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }),
  );
  light.position.set(0.1, 0.26, 0);
  mesh.add(body, light);
  mesh.visible = false;
  scene.add(mesh);
  const blink = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  scene.add(blink);

  const state = {
    status: 'carried', // carried | dropped | planting | planted | defused | detonated
    carrier: null,
    site: null,
    x: 0, z: 0,
    plantProgress: 0,
    defuseProgress: 0,
    fuseLeft: FUSE_TIME,
    beepTimer: 0,
    exploded: false,
  };

  function placeAt(x, z) {
    state.x = x;
    state.z = z;
    mesh.position.set(x, 0, z);
  }

  function dropAt(x, z) {
    state.status = 'dropped';
    state.carrier = null;
    placeAt(x, z);
    mesh.visible = true;
  }

  function plantAt(site) {
    state.status = 'planted';
    state.site = site;
    state.fuseLeft = FUSE_TIME;
    state.plantProgress = 1;
    placeAt(site.x, site.z);
    mesh.visible = true;
  }

  function step(dt, audio, onBeep) {
    if (state.status === 'planted') {
      state.fuseLeft -= dt;
      state.beepTimer -= dt;
      const interval = state.fuseLeft > 20 ? 1.0 : state.fuseLeft > 10 ? 0.5 : 0.25;
      if (state.beepTimer <= 0) {
        state.beepTimer = interval;
        light.material.color.setHex(0xff3020);
        blink.intensity = 6;
        blink.position.set(state.x, 1, state.z);
        audio.beep(false);
        if (onBeep) onBeep();
      } else {
        blink.intensity = Math.max(0, blink.intensity - dt * 20);
      }
      if (state.fuseLeft <= 0 && !state.exploded) {
        state.exploded = true;
        state.status = 'detonated';
        mesh.visible = false;
        blink.intensity = 0;
      }
    }
  }

  function reset(carrier) {
    state.status = 'carried';
    state.carrier = carrier;
    state.site = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.fuseLeft = FUSE_TIME;
    state.beepTimer = 0;
    state.exploded = false;
    mesh.visible = false;
    blink.intensity = 0;
  }

  return {
    state,
    mesh,
    dropAt,
    plantAt,
    placeAt,
    step,
    reset,
    PLANT_TIME,
    DEFUSE_TIME,
    FUSE_TIME,
    BLAST_RADIUS,
  };
}
