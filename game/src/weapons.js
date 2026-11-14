// Senjata: empat senjata api dengan nama asli, plus granat.
// Setiap senjata punya magasin, cadangan, jeda tembak, damage, pengali headshot,
// recoil, dan penyebaran yang membesar saat bergerak atau menembak terus.
// Satu view model dibangun ulang tiap ganti senjata (laras, magasin, teropong).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Kestrel P9', kind: 'pistol', price: 0,
    mag: 12, reserve: 48, gap: 0.22, reloadTime: 1.3,
    damage: 34, headMult: 2.0, spreadStill: 0.004, spreadMove: 0.03,
    recoil: 0.011, auto: false, barrel: 0.22, scope: false,
  },
  rifle: {
    id: 'rifle', name: 'Badak AR-7', kind: 'rifle', price: 2700,
    mag: 30, reserve: 90, gap: 0.098, reloadTime: 1.9,
    damage: 33, headMult: 2.4, spreadStill: 0.0022, spreadMove: 0.026,
    recoil: 0.009, auto: true, barrel: 0.42, scope: false,
  },
  smg: {
    id: 'smg', name: 'Tawon SMG-9', kind: 'smg', price: 1500,
    mag: 25, reserve: 100, gap: 0.07, reloadTime: 1.6,
    damage: 24, headMult: 2.0, spreadStill: 0.005, spreadMove: 0.034,
    recoil: 0.006, auto: true, barrel: 0.3, scope: false,
  },
  sniper: {
    id: 'sniper', name: 'Elang LR-50', kind: 'sniper', price: 4750,
    mag: 5, reserve: 15, gap: 1.15, reloadTime: 2.8,
    damage: 95, headMult: 2.2, spreadStill: 0.0004, spreadMove: 0.05,
    recoil: 0.05, auto: false, barrel: 0.62, scope: true,
  },
};

export const GRENADE_PRICE = 300;

export function createWeaponRig(camera, audio) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concrete), roughness: 0.65, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wall), roughness: 0.45, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.2 });

  const model = new THREE.Group();
  model.position.set(0.26, -0.26, -0.58);
  model.scale.setScalar(0.8);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.24, -0.98);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 5);
  flashLight.position.set(0.26, -0.22, -0.7);
  camera.add(flashLight);

  let current = WEAPONS.pistol;
  const state = {
    id: 'pistol', mag: current.mag, reserve: current.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
  };

  function rebuildModel() {
    while (model.children.length > 0) model.remove(model.children[0]);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.34), steel);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, current.barrel), dark);
    barrel.position.set(0, 0.025, -0.17 - current.barrel / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.14), dark);
    stock.position.set(0, -0.02, 0.22);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), dark);
    grip.position.set(0, -0.12, 0.08);
    grip.rotation.x = 0.3;
    model.add(receiver, barrel, stock, grip);
    if (current.scope) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.085, -0.05);
      model.add(scope);
    } else {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), accent);
      sight.position.set(0, 0.075, -0.12);
      model.add(sight);
    }
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, current.id === 'sniper' ? 0.1 : 0.18, 0.09), dark);
    mag.position.set(0, -0.12, -0.02);
    mag.rotation.x = 0.12;
    model.add(mag);
  }
  rebuildModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.58 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() { return current; },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    canFire() { return state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() {
      state.cooldown = current.gap;
      state.flash = 0.06;
      state.kick = current.id === 'sniper' ? 0.11 : 0.055;
      state.bloom = Math.min(0.05, state.bloom + (current.id === 'smg' ? 0.004 : 0.006));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === current.mag || state.reserve === 0) return false;
      state.reloadLeft = current.reloadTime;
      audio.reload();
      return true;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.4);
      return current.spreadStill + moving * current.spreadMove + state.bloom;
    },
    equip(id, keepAmmo) {
      const def = WEAPONS[id];
      if (!def) return false;
      const oldMag = state.mag;
      const oldReserve = state.reserve;
      current = def;
      state.id = id;
      if (keepAmmo) {
        state.mag = oldMag;
        state.reserve = oldReserve;
      } else {
        state.mag = def.mag;
        state.reserve = def.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      rebuildModel();
      return true;
    },
    addReserve(amount) { state.reserve += amount; },
    refill() {
      state.mag = current.mag;
      state.reserve = current.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
