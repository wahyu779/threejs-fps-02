// Pelabuhan Senja — orkestrasi: loop simulasi 60 Hz terpisah dari render,
// tembakan pemain, AI bot, bom, ronde, ekonomi, granat.
// ?shot=start|play|plant|end&seed=N membekukan satu frame deterministik.
// ?test=bots|round|bomb|buy|reload|grenade&t=N menjalankan simulasi sinkron
// lalu menulis JSON ke #test-status dan window.__testReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, pickRandom } from './rng.js';
import { createMap, SITES, SPAWNS, WAYPOINTS, nearestWaypoint } from './map.js';
import { createMover } from './mover.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeaponRig, WEAPONS, GRENADE_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEconomy, START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, SHOP } from './economy.js';
import { createRounds, BUY_SECONDS, ROUND_SECONDS } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const test = params.get('test');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const testSeconds = Number.parseFloat(params.get('t') ?? '20') || 20;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color('#454c6b'), 26, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createMap(scene);
const mover = createMover(world.colliders);
const audio = createAudio();
if (shot || test) audio.setMuted(true);
const player = createPlayer(mover);
const rig = createWeaponRig(camera, audio);
const hud = createHud();
const economy = createEconomy();
const rounds = createRounds();
const bomb = createBomb(scene);
const botsApi = createBots(scene, mover, random, world);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const body = player.state;
const bots = botsApi.bots;
let allies = [];
let enemies = [];
let targetSite = SITES.A;
let carrier = null;
let grenades = [];
let elapsed = 0;
let started = false;
let frozen = false;
let overTimer = 0;
let buyOpen = false;
let lastShotSound = 0;

function spawnAll() {
  // Penjaga di selatan menghadap utara (yaw 0 = menghadap -z).
  player.reset(SPAWNS.defender[0][0], SPAWNS.defender[0][1], 0);
  allies = [
    botsApi.spawnBot('defender', 'Rani', SPAWNS.defender[1][0], SPAWNS.defender[1][1], 'hold'),
    botsApi.spawnBot('defender', 'Bimo', SPAWNS.defender[2][0], SPAWNS.defender[2][1], 'hold'),
  ];
  enemies = [
    botsApi.spawnBot('attacker', 'Kala', SPAWNS.attacker[0][0], SPAWNS.attacker[0][1], 'push'),
    botsApi.spawnBot('attacker', 'Sinta', SPAWNS.attacker[1][0], SPAWNS.attacker[1][1], 'push'),
    botsApi.spawnBot('attacker', 'Damar', SPAWNS.attacker[2][0], SPAWNS.attacker[2][1], 'push'),
  ];
  // Rani menjaga A, Bimo menjaga B.
  allies[0].holdNodes = [23, 7];
  allies[1].holdNodes = [24, 11];
  allies[0].holdIndex = 0;
  allies[1].holdIndex = 0;
}

function resetPositions() {
  targetSite = pickRandom(random, [SITES.A, SITES.B]);
  player.reset(SPAWNS.defender[0][0], SPAWNS.defender[0][1], 0);
  const allySpawns = [SPAWNS.defender[1], SPAWNS.defender[2]];
  allies.forEach((bot, i) => {
    botsApi.reset(bot, allySpawns[i][0], allySpawns[i][1], 0);
    bot.holdNodes = i === 0 ? [23, 7] : [24, 11];
    bot.holdIndex = 0;
    bot.holdTimer = 0;
  });
  enemies.forEach((bot, i) => {
    botsApi.reset(bot, SPAWNS.attacker[i][0], SPAWNS.attacker[i][1], Math.PI);
  });
  carrier = enemies[0];
  carrier.hasBomb = true;
  bomb.reset(carrier);
  grenades.forEach((g) => { scene.remove(g.mesh); });
  grenades = [];
  rig.refill();
  hud.hidePlant();
  hud.setWeaponName(rig.def().name);
}

function startMatch() {
  economy.resetMatch();
  rounds.resetMatch();
  rig.equip('pistol', false);
  resetPositions();
  hud.setMoney(economy.state.money, economy.state.grenades);
  hud.setScore(0, 0, 1);
  hud.hideOverlay();
}

function startNextRound() {
  rounds.startRound(rounds.state.round + 1);
  resetPositions();
  hud.setScore(rounds.state.wins.defender, rounds.state.wins.attacker, rounds.state.round);
  hud.hideOverlay();
}

function endRound(winner, reason) {
  if (rounds.state.phase === 'over') return;
  const playerWon = winner === 'defender';
  rounds.endRound(winner, reason);
  overTimer = 4;
  hud.setTimer('0:00', 'RONDE SELESAI');
  hud.setBomb(playerWon ? 'Ronde dimenangkan Penjaga' : 'Ronde dimenangkan Penyusup', !playerWon);
  economy.earn(playerWon ? WIN_REWARD : LOSS_REWARD);
  hud.setMoney(economy.state.money, economy.state.grenades);
  hud.setScore(rounds.state.wins.defender, rounds.state.wins.attacker, rounds.state.round);
  if (playerWon) audio.roundWin(); else audio.roundLoss();
  if (rounds.state.matchOver) {
    const text = rounds.state.matchWinner === 'defender' ? 'Penjaga menang!'
      : rounds.state.matchWinner === 'attacker' ? 'Penyusup menang!' : 'Seri!';
    hud.showMatchEnd(text, `Penjaga ${rounds.state.wins.defender} — ${rounds.state.wins.attacker} Penyusup`);
  } else {
    const text = playerWon ? 'Ronde dimenangkan Penjaga' : 'Ronde dimenangkan Penyusup';
    hud.showRoundEnd(text, reason, `Penjaga ${rounds.state.wins.defender} — ${rounds.state.wins.attacker} Penyusup`);
  }
}

function onLockChange(locked) {
  if (shot || test) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (started && !buyOpen && rounds.state.phase !== 'over' && body.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot || test) return;
  if (rounds.state.matchOver) {
    startMatch();
    input.requestLock();
    return;
  }
  audio.unlock();
  input.requestLock();
});
hud.onBuyClose(() => closeBuy());

function openBuy() {
  if (rounds.state.phase !== 'buy') {
    hud.killfeed('Fase beli sudah lewat — beli di ronde berikut.', false);
    return;
  }
  buyOpen = true;
  hud.openBuy(tryBuy, rounds.state.phaseTime);
  input.releaseLock();
}

function closeBuy() {
  buyOpen = false;
  hud.closeBuy();
  if (started && !shot && !test) input.requestLock();
}

function tryBuy(id) {
  const result = economy.buy(id);
  hud.buyFlash(id, result.ok, result.reason);
  if (!result.ok) return;
  audio.buy();
  if (id !== 'grenade') {
    rig.equip(id, false);
    hud.setWeaponName(rig.def().name);
  }
  hud.setMoney(economy.state.money, economy.state.grenades);
  if (buyOpen) hud.updateBuyTimer(rounds.state.phaseTime);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

const playerFoePos = new THREE.Vector3();

function visibleEnemiesOf(bot) {
  const foes = bot.team === 'attacker'
    ? (body.alive ? [{ pos: playerFoePos.set(body.position.x, body.position.y, body.position.z), isPlayer: true, bot: null }] : []).concat(allies.filter((a) => a.alive).map((a) => ({ pos: a.position, isPlayer: false, bot: a })))
    : enemies.filter((e) => e.alive).map((e) => ({ pos: e.position, isPlayer: false, bot: e }));
  let best = null;
  let bestDist = Infinity;
  for (const foe of foes) {
    const chest = tmpVec2.set(foe.pos.x, foe.pos.y + 1.1, foe.pos.z);
    const dist = Math.hypot(chest.x - bot.position.x, chest.z - bot.position.z);
    if (dist < bestDist && botsApi.canSee(bot.position, chest)) {
      bestDist = dist;
      best = { foe, dist };
    }
  }
  return best;
}

function botShoot(bot, target) {
  bot.fireTimer = 0.11;
  bot.burstLeft -= 1;
  bot.shotsFired += 1;
  const foe = target.foe;
  const dist = target.dist;
  const targetSpeed = foe.isPlayer ? player.groundSpeed() : Math.hypot(foe.bot.velocity.x, foe.bot.velocity.z);
  let chance = 0.62 * Math.max(0.25, 1 - dist / 46) * (targetSpeed > 3 ? 0.65 : 1);
  if (bot.velocity.lengthSq() > 0.5) chance *= 0.75;
  const hit = random() < chance;
  const head = random() < 0.1;
  const muzzle = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
  const aimPoint = new THREE.Vector3(foe.pos.x, foe.pos.y + (head ? 1.54 : 1.05), foe.pos.z);
  if (!hit) {
    aimPoint.x += (random() - 0.5) * 1.6;
    aimPoint.y += (random() - 0.5) * 1.2;
    aimPoint.z += (random() - 0.5) * 1.6;
  }
  botsApi.addTracer(muzzle, aimPoint, 0xffc266);
  if (hit) {
    const damage = head ? 52 : 26;
    if (foe.isPlayer) damagePlayer(damage, bot.position, bot);
    else {
      const killed = botsApi.damage(foe.bot, damage, head ? 'head' : 'torso', bot);
      if (killed) {
        hud.killfeed(`${bot.name} membunuh ${foe.bot.name}${head ? ' (headshot)' : ''}`, false);
        onBotKilled(foe.bot, bot);
      }
    }
  }
  if (elapsed - lastShotSound > 0.05) {
    audio.shot('rifle');
    lastShotSound = elapsed;
  }
  hearShot(bot.position);
}

function hearShot(fromPos) {
  for (const bot of bots) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.position.x - fromPos.x, bot.position.z - fromPos.z);
    if (dist < 26) {
      bot.heardAt = { x: fromPos.x, z: fromPos.z };
      bot.heardTime = elapsed;
    }
  }
}

function onBotKilled(victim, killer) {
  if (victim.hasBomb) {
    victim.hasBomb = false;
    bomb.dropAt(victim.position.x, victim.position.z);
    hud.setBomb('Bom jatuh! Penyusup lain akan mengambilnya.', true);
  }
  if (victim.team === 'attacker' && killer === null) {
    // dibunuh pemain: hadiah sudah dicatat di shoot()
  }
}

function damagePlayer(amount, fromPos, attacker) {
  if (!body.alive) return;
  body.health -= amount;
  audio.hurt();
  const dx = fromPos.x - body.position.x;
  const dz = fromPos.z - body.position.z;
  const worldAngle = Math.atan2(dx, dz);
  const relative = worldAngle + body.yaw;
  hud.damageFrom((relative * 180) / Math.PI);
  hud.setHealth(body.health);
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    hud.setHealth(0);
    hud.killfeed(`${attacker ? attacker.name : 'Bom'} membunuhmu`, false);
    hud.showRoundEnd('Kamu gugur', 'Rekanmu masih bertarung — tunggu ronde berakhir.', `Penjaga ${rounds.state.wins.defender} — ${rounds.state.wins.attacker} Penyusup`);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function botStep(bot, dt) {
  if (!bot.alive) return;
  bot.scanTimer -= dt;
  bot.fireTimer -= dt;

  // Cari musuh terlihat.
  if (bot.scanTimer <= 0) {
    bot.scanTimer = 0.15;
    const seen = visibleEnemiesOf(bot);
    if (seen) {
      if (!bot.visibleEnemy) bot.reactTimer = 0.35;
      bot.visibleEnemy = seen;
    } else {
      bot.visibleEnemy = null;
    }
  }
  if (bot.reactTimer > 0) bot.reactTimer -= dt;

  // Tembak kalau ada musuh terlihat dan sudah bereaksi.
  if (bot.visibleEnemy && bot.reactTimer <= 0) {
    const foe = bot.visibleEnemy.foe;
    const tx = foe.pos.x;
    const tz = foe.pos.z;
    bot.yaw = Math.atan2(-(tx - bot.position.x), -(tz - bot.position.z));
    bot.velocity.set(0, 0, 0);
    if (bot.burstLeft <= 0) bot.burstLeft = 2 + Math.floor(random() * 4);
    if (bot.burstLeft > 0 && bot.fireTimer <= 0) botShoot(bot, bot.visibleEnemy);
    if (bot.role === 'push' && bot.hasBomb) bot.plantProgress = 0;
    return;
  }

  // Pembawa bom yang sudah sampai situs: menanam.
  if (bot.hasBomb && bot.role === 'push') {
    const distSite = Math.hypot(bot.position.x - targetSite.x, bot.position.z - targetSite.z);
    if (distSite < 2.2) {
      bot.plantProgress += dt / bomb.PLANT_TIME;
      bomb.state.status = 'planting';
      bomb.state.plantProgress = bot.plantProgress;
      if (bot.plantProgress >= 1) {
        bomb.plantAt(targetSite);
        bot.hasBomb = false;
        audio.plantDone();
        hud.setBomb(`BOM DITANAM di ${targetSite.id}! Jinakkan sebelum meledak.`, true);
        hud.killfeed(`${bot.name} menanam bom di situs ${targetSite.id}`, false);
      }
      return;
    }
  }

  // Ambil bom jatuh kalau ada penyerang terdekat yang bebas.
  if (bomb.state.status === 'dropped' && bot.team === 'attacker') {
    const distBomb = Math.hypot(bot.position.x - bomb.state.x, bot.position.z - bomb.state.z);
    if (distBomb < 1.5) {
      bot.hasBomb = true;
      bomb.state.status = 'carried';
      bomb.state.carrier = bot;
      hud.setBomb('Penyusup mengambil bom kembali.', true);
    } else if (bot === nearestAttackerToBomb()) {
      botsApi.setPath(bot, nearestWaypoint(bomb.state.x, bomb.state.z));
      botsApi.followPath(bot, dt);
      return;
    }
  }

  // Dengar tembakan: selidiki.
  if (bot.heardAt && elapsed - bot.heardTime < 6) {
    const node = nearestWaypoint(bot.heardAt.x, bot.heardAt.z);
    if (bot.targetNode !== node) botsApi.setPath(bot, node);
    if (botsApi.followPath(bot, dt)) {
      bot.heardAt = null;
    }
    return;
  }

  // Peran: penyerang maju ke situs, penjaga patroli titik jaga.
  if (bot.team === 'attacker') {
    const siteNode = targetSite.id === 'A' ? 19 : 20;
    if (bot.targetNode !== siteNode) botsApi.setPath(bot, siteNode);
    botsApi.followPath(bot, dt);
  } else {
    const hold = bot.holdNodes[bot.holdIndex % bot.holdNodes.length];
    if (bot.targetNode !== hold) botsApi.setPath(bot, hold);
    if (botsApi.followPath(bot, dt)) {
      bot.holdTimer = (bot.holdTimer ?? 0) + dt;
      if (bot.holdTimer > 2.5 + (bot.id % 3)) {
        bot.holdTimer = 0;
        bot.holdIndex += 1;
        bot.targetNode = -1;
      }
    }
  }
}

function nearestAttackerToBomb() {
  let best = null;
  let bestDist = Infinity;
  for (const bot of enemies) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - bomb.state.x, bot.position.z - bomb.state.z);
    if (d < bestDist) { bestDist = d; best = bot; }
  }
  return best;
}

function shootPlayer(spread) {
  if (!rig.takeRound()) {
    audio.dryFire();
    rig.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const allTargets = world.shootables.concat(bots.flatMap((b) => [b.model.torso, b.model.head]));
  const hit = raycaster.intersectObjects(allTargets, false)[0];
  if (hit) {
    botsApi.addTracer(camera.position.clone(), hit.point.clone(), 0xffe9a8);
    const victim = hit.object.userData.bot;
    if (victim && victim.alive) {
      const part = hit.object.userData.part;
      const damage = Math.round(rig.def().damage * (part === 'head' ? rig.def().headMult : 1));
      const killed = botsApi.damage(victim, damage, part, null);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
      if (killed) {
        economy.earn(KILL_REWARD);
        hud.setMoney(economy.state.money, economy.state.grenades);
        hud.killfeed(`Kamu membunuh ${victim.name}${part === 'head' ? ' (headshot)' : ''} +$${KILL_REWARD}`, true);
        onBotKilled(victim, null);
      }
    }
  }
  rig.pullTrigger();
  audio.shot(rig.def().kind);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hearShot(body.position);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.reloadLeft > 0);
  return true;
}

function throwGrenade() {
  if (economy.state.grenades <= 0) return;
  economy.state.grenades -= 1;
  hud.setMoney(economy.state.money, economy.state.grenades);
  audio.grenadePin();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 }),
  );
  mesh.position.copy(camera.position);
  scene.add(mesh);
  camera.getWorldDirection(direction);
  grenades.push({
    mesh,
    velocity: new THREE.Vector3(direction.x * 11, direction.y * 11 + 4.5, direction.z * 11),
    timer: 1.6,
  });
}

function explodeGrenade(g) {
  const pos = g.mesh.position;
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc266), transparent: true, opacity: 0.85 }),
  );
  flash.position.copy(pos);
  scene.add(flash);
  setTimeout(() => { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); }, 220);
  audio.explosion();
  const victims = [];
  if (body.alive) victims.push({ pos: body.position, isPlayer: true, bot: null });
  for (const bot of bots) if (bot.alive) victims.push({ pos: bot.position, isPlayer: false, bot });
  for (const victim of victims) {
    const dist = Math.hypot(victim.pos.x - pos.x, victim.pos.z - pos.z) + Math.abs((victim.pos.y + 1) - pos.y) * 0.5;
    if (dist > 6) continue;
    const damage = Math.round(95 * (1 - dist / 7));
    if (damage <= 0) continue;
    if (victim.isPlayer) damagePlayer(damage, pos, null);
    else {
      const killed = botsApi.damage(victim.bot, damage, 'torso', null);
      if (killed) {
        economy.earn(KILL_REWARD);
        hud.setMoney(economy.state.money, economy.state.grenades);
        hud.killfeed(`Granatmu membunuh ${victim.bot.name} +$${KILL_REWARD}`, true);
        onBotKilled(victim.bot, null);
      }
    }
  }
  scene.remove(g.mesh);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.timer -= dt;
    g.velocity.y -= 14 * dt;
    g.mesh.position.addScaledVector(g.velocity, dt);
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      if (g.velocity.y < -1.5) {
        g.velocity.y = -g.velocity.y * 0.3;
      } else {
        g.velocity.y = 0;
      }
      const roll = Math.max(0, 1 - 2.5 * dt);
      g.velocity.x *= roll;
      g.velocity.z *= roll;
    }
    if (g.timer <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  if (bomb.state.status === 'detonated') {
    endRound('attacker', 'Bom meledak di situs ' + (bomb.state.site?.id ?? '?'));
    return;
  }
  if (bomb.state.status === 'defused') {
    endRound('defender', 'Bom berhasil dijinakkan');
    return;
  }
  const attackersAlive = enemies.filter((b) => b.alive).length;
  const defendersAlive = allies.filter((b) => b.alive).length + (body.alive ? 1 : 0);
  if (attackersAlive === 0 && bomb.state.status !== 'planted') {
    endRound('defender', 'Semua Penyusup gugur');
    return;
  }
  if (defendersAlive === 0) {
    endRound('attacker', 'Semua Penjaga gugur');
  }
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  if (phase === 'over') {
    overTimer -= dt;
    botsApi.stepTracers(dt);
    for (const bot of bots) botsApi.syncModel(bot);
    if (overTimer <= 0 && !rounds.state.matchOver) startNextRound();
    return;
  }

  if (phase === 'buy') {
    rounds.state.phaseTime -= dt;
    if (rounds.state.phaseTime <= 0) {
      rounds.state.phase = 'live';
      rounds.state.roundTime = ROUND_SECONDS;
      if (buyOpen) closeBuy();
      hud.setBomb('Jaga situs A dan B!', false);
    }
  } else if (phase === 'live') {
    rounds.state.roundTime -= dt;
    if (rounds.state.roundTime <= 0 && bomb.state.status !== 'planted') {
      endRound('defender', 'Waktu habis — bom tidak ditanam');
      return;
    }
  }

  player.step(dt, input.state.keys);
  rig.step(dt);

  // Tembakan pemain.
  const look = input.takeLook();
  player.look(look.x, look.y);
  const firing = input.state.firing || input.state.keys.has('KeyF');
  if (body.alive && started && firing && rig.ready()) {
    shootPlayer(shot ? 0 : rig.spread(player.groundSpeed()));
  }
  if (body.alive && started && input.state.keys.has('KeyR')) rig.reload();

  // Tombol sekali-tekan.
  for (const code of input.takePressed()) {
    if (code === 'KeyB' && body.alive && started) {
      if (buyOpen) closeBuy(); else openBuy();
    } else if (code === 'KeyG' && body.alive && started) {
      throwGrenade();
    } else if (code.startsWith('Digit') && body.alive && started) {
      const item = SHOP.find((entry) => entry.key === code.slice(5));
      if (item && buyOpen) tryBuy(item.id);
      else if (item && item.id !== 'grenade' && economy.state.owned.has(item.id)) {
        rig.equip(item.id, false);
        hud.setWeaponName(rig.def().name);
        hud.setAmmo(rig.state.mag, rig.state.reserve, false);
      }
    }
  }

  // Menjinakkan bom: tahan E dekat bom yang ditanam.
  if (bomb.state.status === 'planted' && body.alive) {
    const distBomb = Math.hypot(body.position.x - bomb.state.x, body.position.z - bomb.state.z);
    if (distBomb < 2.4 && input.state.keys.has('KeyE')) {
      bomb.state.defuseProgress += dt / bomb.DEFUSE_TIME;
      hud.showPlant('Menjinakkan bom... tahan E', bomb.state.defuseProgress);
      if (bomb.state.defuseProgress >= 1) {
        bomb.state.status = 'defused';
        audio.plantDone();
        hud.hidePlant();
        hud.setBomb('Bom dijinakkan!', false);
      }
    } else {
      bomb.state.defuseProgress = Math.max(0, bomb.state.defuseProgress - dt / 2);
      if (bomb.state.defuseProgress > 0) hud.showPlant('Menjinakkan bom... tahan E', bomb.state.defuseProgress);
      else if (bomb.state.status === 'planting') hud.showPlant(`Penyusup menanam bom di ${targetSite.id}...`, bomb.state.plantProgress);
      else hud.hidePlant();
    }
  } else if (bomb.state.status === 'planting') {
    hud.showPlant(`Penyusup menanam bom di ${targetSite.id}...`, bomb.state.plantProgress);
  } else {
    hud.hidePlant();
  }

  bomb.step(dt, audio);
  if (bomb.state.status === 'detonated' && bomb.state.exploded) {
    // Ledakan: semua yang dekat situs kena.
    bomb.state.exploded = false;
    audio.explosion();
    const victims = [];
    if (body.alive) victims.push({ pos: body.position, isPlayer: true, bot: null });
    for (const bot of bots) if (bot.alive) victims.push({ pos: bot.position, isPlayer: false, bot });
    for (const victim of victims) {
      const dist = Math.hypot(victim.pos.x - bomb.state.x, victim.pos.z - bomb.state.z);
      if (dist > bomb.BLAST_RADIUS) continue;
      const damage = Math.round(220 * (1 - dist / (bomb.BLAST_RADIUS + 2)));
      if (victim.isPlayer) damagePlayer(damage, tmpVec.set(bomb.state.x, 0, bomb.state.z), null);
      else botsApi.damage(victim.bot, damage, 'torso', null);
    }
  }

  for (const bot of bots) {
    if (rounds.state.phase !== 'buy') botStep(bot, dt);
    botsApi.syncModel(bot);
  }
  stepGrenades(dt);
  botsApi.stepTracers(dt);

  // HUD.
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.reloadLeft > 0);
  hud.setHealth(body.health);
  hud.setMoney(economy.state.money, economy.state.grenades);
  hud.setScore(rounds.state.wins.defender, rounds.state.wins.attacker, rounds.state.round);
  hud.setAlive(
    allies.filter((b) => b.alive).length + (body.alive ? 1 : 0),
    enemies.filter((b) => b.alive).length,
  );
  if (rounds.state.phase === 'buy') {
    hud.setTimer(`0:${String(Math.ceil(rounds.state.phaseTime)).padStart(2, '0')}`, 'FASE BELI');
    if (buyOpen) hud.updateBuyTimer(rounds.state.phaseTime);
  } else if (bomb.state.status === 'planted') {
    hud.setTimer(`0:${String(Math.max(0, Math.ceil(bomb.state.fuseLeft))).padStart(2, '0')}`, 'BOM!');
    hud.setBomb(`BOM di ${bomb.state.site.id} — ${Math.ceil(bomb.state.fuseLeft)} dtk`, true);
  } else {
    const total = Math.max(0, Math.ceil(rounds.state.roundTime));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    hud.setTimer(`${minutes}:${String(seconds).padStart(2, '0')}`, `RONDE ${rounds.state.round}`);
  }
  if (bomb.state.status === 'planting') {
    hud.setBomb(`Penyusup menanam bom di ${targetSite.id}...`, true);
  } else if (bomb.state.status === 'dropped') {
    hud.setBomb('Bom jatuh — Penyusup mengambilnya.', true);
  } else if (bomb.state.status === 'carried' && rounds.state.phase === 'live') {
    hud.setBomb(`Bom dibawa Penyusup — jaga A dan B`, false);
  }
  hud.setCrosshairSpread(6 + rig.spread(player.groundSpeed()) * 900 + (rig.state.reloadLeft > 0 ? 10 : 0));

  checkRoundEnd();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && started) {
    let accumulator = 0;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function botSummary() {
  return bots.map((b) => ({
    name: b.name, team: b.team, alive: b.alive,
    x: Math.round(b.position.x * 10) / 10, z: Math.round(b.position.z * 10) / 10,
    hp: Math.round(b.health), shots: b.shotsFired, kills: b.kills,
  }));
}

function runTest(name) {
  started = true;
  let result = {};
  if (name === 'bots') {
    const before = botSummary();
    settle(Math.round(testSeconds * 60));
    result = {
      test: 'bots', seconds: testSeconds,
      before, after: botSummary(),
      round: rounds.state.phase, roundTime: Math.round(rounds.state.roundTime),
      bomb: bomb.state.status, site: targetSite.id,
      playerHp: Math.round(body.health),
      moved: before.some((b, i) => Math.abs(b.x - botSummary()[i].x) > 0.5 || Math.abs(b.z - botSummary()[i].z) > 0.5),
      totalShots: bots.reduce((sum, b) => sum + b.shotsFired, 0),
    };
  } else if (name === 'round') {
    rounds.state.phase = 'live';
    for (const bot of enemies) botsApi.damage(bot, 999, 'torso', null);
    settle(30);
    result = { test: 'round', phase: rounds.state.phase, winner: rounds.state.lastWinner, reason: rounds.state.lastReason, score: rounds.state.wins };
  } else if (name === 'bomb') {
    rounds.state.phase = 'live';
    carrier.position.set(targetSite.x, 0, targetSite.z - 1);
    carrier.hasBomb = true;
    settle(200);
    bomb.state.fuseLeft = 1;
    settle(90);
    result = { test: 'bomb', bomb: bomb.state.status, phase: rounds.state.phase, winner: rounds.state.lastWinner, reason: rounds.state.lastReason, playerHp: Math.round(body.health) };
  } else if (name === 'buy') {
    economy.earn(3000);
    const before = economy.state.money;
    const bought = economy.buy('rifle');
    if (bought.ok) rig.equip('rifle', false);
    result = { test: 'buy', bought, moneyBefore: before, moneyAfter: economy.state.money, weapon: rig.def().name, mag: rig.state.mag, reserve: rig.state.reserve };
  } else if (name === 'reload') {
    while (rig.state.mag > 0) rig.takeRound();
    const emptyMag = rig.state.mag;
    rig.reload();
    settle(150);
    result = { test: 'reload', emptyMag, magAfter: rig.state.mag, reserveAfter: rig.state.reserve, reloading: rig.state.reloadLeft > 0 };
  } else if (name === 'grenade') {
    economy.state.grenades = 1;
    const target = enemies[0];
    // Fase beli: bot diam di tempat, jadi ledakan bisa diukur pasti.
    target.position.set(body.position.x - 13, 0, body.position.z);
    botsApi.syncModel(target);
    aimAt(new THREE.Vector3(target.position.x, 1, target.position.z));
    throwGrenade();
    settle(120);
    result = { test: 'grenade', enemyHp: Math.round(target.health), enemyAlive: target.alive, grenadesLeft: economy.state.grenades };
  } else {
    result = { test: name, error: 'unknown test' };
  }
  hud.setTestStatus(result);
  window.__testReady = true;
  paintTwiceThenReady();
}

function runShot(name) {
  started = true;
  hud.hideOverlay();
  hud.closeBuy();
  if (name === 'start') {
    body.position.set(-2, 0, 10);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(-14, 1.2, -12));
    hud.openBuy(() => {}, BUY_SECONDS);
    hud.setMoney(economy.state.money, economy.state.grenades);
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    body.position.set(3, 0, 7);
    settle(10);
    const foe = enemies[1];
    foe.position.set(-2, 0, -3);
    foe.velocity.set(0, 0, 0);
    const ally = allies[0];
    ally.position.set(-5, 0, 4);
    botsApi.syncModel(foe);
    botsApi.syncModel(ally);
    aimAt(new THREE.Vector3(foe.position.x, 1.2, foe.position.z));
    shootPlayer(0);
    settle(6);
    aimAt(new THREE.Vector3(foe.position.x, 1.1, foe.position.z));
    shootPlayer(0);
    botsApi.addTracer(new THREE.Vector3(-2, 1.35, -3), new THREE.Vector3(3, 1.4, 7), 0xffc266);
    settle(4);
  } else if (name === 'plant') {
    rounds.state.phase = 'live';
    targetSite = SITES.A;
    body.position.set(-11, 0, -11);
    settle(10);
    carrier.position.set(targetSite.x, 0, targetSite.z);
    carrier.hasBomb = true;
    carrier.plantProgress = 0.62;
    bomb.state.status = 'planting';
    bomb.state.plantProgress = 0.62;
    const escort = enemies[1];
    escort.position.set(-18.5, 0, -12);
    botsApi.syncModel(carrier);
    botsApi.syncModel(escort);
    aimAt(new THREE.Vector3(targetSite.x, 1.1, targetSite.z));
    hud.setBomb('Penyusup menanam bom di A...', true);
    hud.showPlant('Penyusup menanam bom di A...', 0.62);
    settle(4);
  } else if (name === 'end') {
    body.position.set(0, 0, 14);
    body.yaw = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    endRound('defender', 'Semua Penyusup gugur');
  }
  hud.setAmmo(rig.state.mag, rig.state.reserve, false);
  hud.setHealth(body.health);
  hud.setMoney(economy.state.money, economy.state.grenades);
  hud.setScore(rounds.state.wins.defender, rounds.state.wins.attacker, rounds.state.round);
  hud.setAlive(
    allies.filter((b) => b.alive).length + (body.alive ? 1 : 0),
    enemies.filter((b) => b.alive).length,
  );
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

spawnAll();
resetPositions();
hud.setAmmo(rig.state.mag, rig.state.reserve, false);
hud.setHealth(100);
hud.setMoney(START_MONEY, 0);
hud.setScore(0, 0, 1);
hud.setTimer('0:12', 'FASE BELI');
hud.setBomb('Fase beli — siapkan senjatamu', false);
hud.setWeaponName(rig.def().name);
hud.showOverlay('start');
syncCamera();

let lastTime = performance.now();
if (shot) runShot(shot);
else if (test) runTest(test);
else requestAnimationFrame(frame);
