// Ekonomi: uang pemain, hadiah bunuh/menang/kalah, dan katalog toko.
// Harga dan hadiah tinggal di sini; main.js yang memanggil buy() dan mencatat.
import { WEAPONS, GRENADE_PRICE } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 325;
export const LOSS_REWARD = 190;

export const SHOP = [
  { id: 'pistol', label: 'Kestrel P9 — pistol', price: WEAPONS.pistol.price, key: '1', note: '12 peluru, akurat dekat' },
  { id: 'rifle', label: 'Badak AR-7 — senapan', price: WEAPONS.rifle.price, key: '2', note: '30 peluru, serba bisa' },
  { id: 'smg', label: 'Tawon SMG-9 — SMG', price: WEAPONS.smg.price, key: '3', note: '25 peluru, cepat, dekat' },
  { id: 'sniper', label: 'Elang LR-50 — sniper', price: WEAPONS.sniper.price, key: '4', note: '5 peluru, 1 tembak gugur' },
  { id: 'grenade', label: 'Granat Petir — frag', price: GRENADE_PRICE, key: '5', note: 'Lempar dengan G, meledak 1,6 dtk' },
];

export function createEconomy() {
  const state = {
    money: START_MONEY,
    owned: new Set(['pistol']),
    grenades: 0,
    current: 'pistol',
  };

  function canAfford(price) { return state.money >= price; }

  // Beli senjata (sekali beli = dimiliki selamanya dalam match) atau granat.
  // Kembalikan { ok, reason } supaya HUD bisa menjelaskan kenapa gagal.
  function buy(id) {
    const item = SHOP.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: 'tidak ada' };
    if (id === 'grenade') {
      if (!canAfford(item.price)) return { ok: false, reason: 'uang kurang' };
      if (state.grenades >= 2) return { ok: false, reason: 'maks 2 granat' };
      state.money -= item.price;
      state.grenades += 1;
      return { ok: true, reason: 'granat +1' };
    }
    if (state.owned.has(id)) {
      state.current = id;
      return { ok: true, reason: 'sudah dimiliki' };
    }
    if (!canAfford(item.price)) return { ok: false, reason: 'uang kurang' };
    state.money -= item.price;
    state.owned.add(id);
    state.current = id;
    return { ok: true, reason: 'dibeli' };
  }

  function earn(amount) { state.money += amount; }

  function resetMatch() {
    state.money = START_MONEY;
    state.owned = new Set(['pistol']);
    state.grenades = 0;
    state.current = 'pistol';
  }

  return { state, buy, earn, canAfford, resetMatch };
}
