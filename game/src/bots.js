// Bot: satu model tubuh per bot (badan + kepala + senjata, warna tim),
// satu mesin state kecil: jalan di graf waypoint, jaga, sergap, dengar tembakan,
// tembak balik. Bot menembak hitscan dengan peluang kena yang turun dengan
// jarak dan kecepatan target; peluru yang meleset tetap terlihat lewat tracer.
import * as THREE from 'three';
import { PALETTE, TEAM_COLORS } from './palette.js';
import { WAYPOINTS, findPath, nearestWaypoint } from './map.js';
import { rangeRandom } from './rng.js';

const BOT_HEIGHT = 1.72;
const BOT_EYE = 1.5;
const BOT_SPEED = 3.4;
const HEALTH = 100;
const SEE_RANGE = 34;
const HEAR_RANGE = 26;
const SCAN_EVERY = 0.15;
const BURST_MIN = 2;
const BURST_MAX = 5;

let botCounter = 0;

export function createBots(scene, mover, random, world) {
  const bots = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const tmpDir = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tracers = [];

  const bodyGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  function buildModel(team, name) {
    const color = new THREE.Color(TEAM_COLORS[team]);
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concrete), roughness: 0.8 });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(bodyGeo, cloth);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 }));
    head.position.y = 1.54;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), dark);
    visor.position.set(0, 1.56, -0.14);
    const legL = new THREE.Mesh(legGeo, dark);
    legL.position.set(-0.14, 0.28, 0);
    const legR = new THREE.Mesh(legGeo, dark);
    legR.position.set(0.14, 0.28, 0);
    const gun = new THREE.Mesh(gunGeo, dark);
    gun.position.set(0.2, 1.05, -0.25);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    const label = makeLabel(name, team);
    label.position.y = 1.95;
    group.add(label);
    return { group, torso, head, legL, legR };
  }

  function makeLabel(text, team) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = team === 'defender' ? '#2ec4b6' : '#e4572e';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(1.6, 0.4, 1);
    return sprite;
  }

  function spawnBot(team, name, x, z, role) {
    const id = botCounter;
    botCounter += 1;
    const model = buildModel(team, name);
    model.group.position.set(x, 0, z);
    scene.add(model.group);
    const bot = {
      id, team, name, role,
      model,
      position: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(),
      yaw: team === 'attacker' ? Math.PI : 0,
      health: HEALTH,
      alive: true,
      fall: 0,
      path: [],
      pathIndex: 0,
      targetNode: -1,
      state: 'idle',
      scanTimer: rangeRandom(random, 0, SCAN_EVERY),
      burstLeft: 0,
      fireTimer: 0,
      reactTimer: 0,
      holdTimer: 0,
      aimError: 0,
      visibleEnemy: null,
      heardAt: null,
      heardTime: -99,
      plantProgress: 0,
      defuseProgress: 0,
      shotsFired: 0,
      kills: 0,
      walkPhase: random() * 6,
      holdIndex: 0,
      hasBomb: false,
    };
    model.torso.userData.bot = bot;
    model.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function setPath(bot, toNode) {
    const from = nearestWaypoint(bot.position.x, bot.position.z);
    bot.path = findPath(from, toNode);
    bot.pathIndex = 0;
    bot.targetNode = toNode;
  }

  function stepToward(bot, dt, tx, tz, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    bot.velocity.set((dx / dist) * speed, 0, (dz / dist) * speed);
    const before = bot.position.clone();
    bot.position.x += (dx / dist) * step;
    bot.position.z += (dz / dist) * step;
    // Tabrakan: kalau kotak menabrak, coba geser per sumbu; kalau tetap macet, berhenti.
    if (mover.hits(bot.position.x, 0, bot.position.z, BOT_HEIGHT, 0.04)) {
      bot.position.x = before.x;
      if (mover.hits(bot.position.x, 0, bot.position.z, BOT_HEIGHT, 0.04)) {
        bot.position.z = before.z;
        bot.velocity.set(0, 0, 0);
        return false;
      }
    }
    bot.yaw = Math.atan2(-dx, -dz);
    bot.walkPhase += dt * 7;
    return dist - step < 0.8;
  }

  function followPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = WAYPOINTS[bot.path[bot.pathIndex]];
    if (stepToward(bot, dt, node.x, node.z, BOT_SPEED)) bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }

  // Garis pandang: ada yang menghalangi antara mata bot dan dada target?
  function canSee(fromPos, toPos) {
    tmpDir.copy(toPos).sub(fromPos);
    const dist = tmpDir.length();
    if (dist > SEE_RANGE) return false;
    tmpDir.normalize();
    const eye = new THREE.Vector3(fromPos.x, fromPos.y + BOT_EYE, fromPos.z);
    raycaster.set(eye, tmpDir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance >= dist - 0.6;
  }

  function eyePos(bot) {
    return tmpTarget.set(bot.position.x, bot.position.y + BOT_EYE, bot.position.z);
  }

  function damage(bot, amount, part, attacker) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.velocity.set(0, 0, 0);
    if (attacker) attacker.kills += 1;
    return true;
  }

  function reset(bot, x, z, yaw) {
    bot.position.set(x, 0, z);
    bot.velocity.set(0, 0, 0);
    bot.yaw = yaw;
    bot.health = HEALTH;
    bot.alive = true;
    bot.fall = 0;
    bot.path = [];
    bot.pathIndex = 0;
    bot.state = 'idle';
    bot.visibleEnemy = null;
    bot.heardAt = null;
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    bot.burstLeft = 0;
    bot.fireTimer = 0;
    bot.hasBomb = false;
    bot.model.group.rotation.set(0, 0, 0);
    bot.model.group.position.set(x, 0, z);
    bot.model.group.visible = true;
  }

  function syncModel(bot) {
    const group = bot.model.group;
    group.position.copy(bot.position);
    if (bot.alive) {
      group.rotation.y = bot.yaw;
      group.rotation.x = 0;
      const swing = Math.sin(bot.walkPhase) * 0.35 * Math.min(1, Math.hypot(bot.velocity.x, bot.velocity.z) / BOT_SPEED);
      bot.model.legL.rotation.x = swing;
      bot.model.legR.rotation.x = -swing;
    } else {
      bot.fall = Math.min(1, bot.fall + 1 / 30);
      group.rotation.x = -bot.fall * 1.5;
    }
  }

  function addTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.09 });
  }

  function stepTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers[i].line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  return {
    bots,
    spawnBot,
    setPath,
    followPath,
    canSee,
    damage,
    reset,
    syncModel,
    addTracer,
    stepTracers,
    stepToward,
  };
}
