// Keyboard + mouse + pointer lock. Selain tombol gerak, modul ini juga
// menangkap tepi tombol sekali-tekan (B beli, E interaksi, G granat, angka 1-5)
// supaya main.js tidak perlu mengawasi keydown sendiri.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      try { canvas.requestPointerLock(); } catch { /* headless: abaikan */ }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Ambil dan kosongkan tombol sekali-tekan sejak pemanggilan terakhir.
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    // Untuk mode shot/test: tekan tombol secara sintetis dari kode.
    press(code) { pressed.add(code); keys.add(code); },
    unpress(code) { keys.delete(code); },
  };
}
