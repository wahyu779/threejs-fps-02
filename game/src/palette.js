// Palet senja untuk "Pelabuhan Senja": satu langit senja, beton hangat, kayu peti,
// kontainer karat dan teal, satu aksen amber. Nama-nama ini juga dipakai sebagai
// custom property CSS di index.html, jadi HUD dan dunia 3D selalu sepakat.
export const PALETTE = {
  sky: '#2b3048',
  dusk: '#e08a4e',
  ground: '#7d7268',
  concrete: '#6a6a72',
  wall: '#565a68',
  wood: '#8a6b45',
  rust: '#a4552f',
  teal: '#2e6f6a',
  ink: '#f2ede2',
  muted: '#9aa3b0',
  amber: '#f5a623',
  site: '#c98a2e',
  ally: '#2ec4b6',
  enemy: '#e4572e',
};

export const TEAM_COLORS = {
  defender: PALETTE.ally,
  attacker: PALETTE.enemy,
};
