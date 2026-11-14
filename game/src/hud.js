// HUD DOM: semua angka dan panel. Tidak menyentuh simulasi — main.js mendorong
// angka masuk lewat setter, dan membaca callback keluar (tombol main, tombol beli).
import { SHOP } from './economy.js';

const OVERLAY_TEXT = {
  start: {
    title: 'Pelabuhan Senja',
    copy: 'Tiga lawan tiga di halaman pelabuhan saat senja. Jaga situs A dan B — jangan biarkan bom meledak.',
    action: 'Klik untuk main',
  },
  paused: {
    title: 'Pelabuhan Senja',
    copy: 'Jeda. Klik untuk lanjut.',
    action: 'Klik untuk lanjut',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'),
    play: $('play'), roundTitle: $('round-title'), roundCopy: $('round-copy'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    healthFill: $('health-fill'), healthNum: $('health-num'),
    money: $('money-value'), grenades: $('grenade-count'),
    timer: $('timer-value'), timerLabel: $('timer-label'),
    scoreDef: $('score-def'), scoreAtk: $('score-atk'), roundNum: $('round-num'),
    aliveDef: $('alive-def'), aliveAtk: $('alive-atk'),
    bomb: $('bomb-status'), killfeed: $('killfeed'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    damageDir: $('damage-dir'), buyMenu: $('buy-menu'), buyList: $('buy-list'),
    buyMoney: $('buy-money'), buyTimer: $('buy-timer'), buyClose: $('buy-close'),
    plantBar: $('plant-bar'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    weaponName: $('weapon-name'), testStatus: $('test-status'),
  };
  let hitTimer = 0;
  let lastAmmo = '';
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';

  function buildBuyList(onBuy) {
    els.buyList.innerHTML = '';
    for (const item of SHOP) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.id = item.id;
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}<span class="buy-note">${item.note}</span></span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => onBuy(item.id));
      els.buyList.appendChild(row);
    }
  }

  return {
    setAmmo(mag, reserve, reloading) {
      const key = `${mag}|${reserve}|${reloading}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      els.ammoMag.textContent = reloading ? '--' : String(mag);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.ammo.classList.toggle('empty', mag === 0 && !reloading);
      els.ammo.classList.toggle('reloading', reloading);
    },
    setHealth(value) {
      const rounded = Math.max(0, Math.round(value));
      if (rounded === lastHealth) return;
      lastHealth = rounded;
      els.healthFill.style.width = `${rounded}%`;
      els.healthNum.textContent = String(rounded);
      els.healthFill.classList.toggle('low', rounded <= 30);
    },
    setMoney(value, grenades) {
      if (value === lastMoney && grenades === Number(els.grenades.textContent)) return;
      lastMoney = value;
      els.money.textContent = `$${value}`;
      els.grenades.textContent = String(grenades);
      els.buyMoney.textContent = `$${value}`;
    },
    setTimer(text, label) {
      const key = `${text}|${label}`;
      if (key === lastTimer) return;
      lastTimer = key;
      els.timer.textContent = text;
      els.timerLabel.textContent = label;
    },
    setScore(def, atk, round) {
      const key = `${def}|${atk}|${round}`;
      if (key === lastScore) return;
      lastScore = key;
      els.scoreDef.textContent = String(def);
      els.scoreAtk.textContent = String(atk);
      els.roundNum.textContent = `Ronde ${round}`;
    },
    setAlive(def, atk) {
      const key = `${def}|${atk}`;
      if (key === lastAlive) return;
      lastAlive = key;
      els.aliveDef.textContent = `Penjaga ${def} hidup`;
      els.aliveAtk.textContent = `Penyusup ${atk} hidup`;
    },
    setBomb(text, urgent) {
      els.bomb.textContent = text;
      els.bomb.classList.toggle('urgent', !!urgent);
    },
    setWeaponName(name) { els.weaponName.textContent = name; },
    setCrosshairSpread(spreadPx) {
      els.crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFrom(angleDeg) {
      els.damageDir.style.transform = `translate(-50%, -50%) rotate(${Math.round(angleDeg)}deg)`;
      els.damageDir.classList.add('on');
      setTimeout(() => els.damageDir.classList.remove('on'), 450);
    },
    killfeed(text, good) {
      const entry = document.createElement('div');
      entry.className = `feed-entry${good ? ' good' : ''}`;
      entry.textContent = text;
      els.killfeed.prepend(entry);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => { entry.classList.add('fade'); }, 4000);
      setTimeout(() => { entry.remove(); }, 5000);
    },
    showPlant(label, progress) {
      els.plantBar.hidden = false;
      els.plantLabel.textContent = label;
      els.plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hidePlant() { els.plantBar.hidden = true; },
    showOverlay(mode, extra) {
      const text = OVERLAY_TEXT[mode];
      els.title.textContent = text.title;
      els.copy.textContent = extra ?? text.copy;
      els.play.textContent = text.action;
      els.overlay.hidden = false;
      els.roundTitle.hidden = true;
    },
    showRoundEnd(winnerText, reason, scoreText) {
      els.overlay.hidden = false;
      els.title.hidden = true;
      els.copy.hidden = true;
      els.play.hidden = true;
      els.roundTitle.hidden = false;
      els.roundCopy.hidden = false;
      els.roundTitle.textContent = winnerText;
      els.roundCopy.textContent = `${reason} — ${scoreText}`;
    },
    showMatchEnd(winnerText, scoreText) {
      els.overlay.hidden = false;
      els.title.hidden = true;
      els.copy.hidden = true;
      els.roundTitle.hidden = false;
      els.roundCopy.hidden = false;
      els.roundTitle.textContent = winnerText;
      els.roundCopy.textContent = scoreText;
      els.play.hidden = false;
      els.play.textContent = 'Main lagi';
    },
    hideOverlay() {
      els.overlay.hidden = true;
      els.title.hidden = false;
      els.copy.hidden = false;
      els.play.hidden = false;
      els.roundTitle.hidden = true;
      els.roundCopy.hidden = true;
    },
    openBuy(onBuy, secondsLeft) {
      buildBuyList(onBuy);
      els.buyMenu.hidden = false;
      els.buyTimer.textContent = `Fase beli: ${Math.ceil(secondsLeft)} dtk — tekan B untuk tutup`;
    },
    updateBuyTimer(secondsLeft) {
      els.buyTimer.textContent = `Fase beli: ${Math.ceil(secondsLeft)} dtk — tekan B untuk tutup`;
    },
    closeBuy() { els.buyMenu.hidden = true; },
    buyFlash(id, ok, reason) {
      const row = els.buyList.querySelector(`[data-id="${id}"]`);
      if (!row) return;
      row.classList.remove('ok', 'bad');
      void row.offsetWidth;
      row.classList.add(ok ? 'ok' : 'bad');
      row.title = reason;
    },
    setTestStatus(json) {
      els.testStatus.textContent = JSON.stringify(json);
    },
    onPlay(handler) { els.play.addEventListener('click', handler); },
    onBuyClose(handler) { els.buyClose.addEventListener('click', handler); },
  };
}
