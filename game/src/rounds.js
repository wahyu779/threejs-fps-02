// Ronde: fase beli 12 dtk, lalu ronde 100 dtk. Menang pertama ke 5 (maks 9 ronde).
// Ronde berakhir karena eliminasi, bom meledak / dijinakkan, atau waktu habis.
// Modul ini hanya menyimpan angka dan fase; main.js yang memutuskan pemenang.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createRounds() {
  const state = {
    round: 1,
    wins: { defender: 0, attacker: 0 },
    phase: 'buy', // buy | live | over
    phaseTime: BUY_SECONDS,
    roundTime: ROUND_SECONDS,
    lastWinner: null,
    lastReason: '',
    matchOver: false,
    matchWinner: null,
  };

  function startRound(number) {
    state.round = number;
    state.phase = 'buy';
    state.phaseTime = BUY_SECONDS;
    state.roundTime = ROUND_SECONDS;
    state.lastWinner = null;
    state.lastReason = '';
  }

  function endRound(winner, reason) {
    state.phase = 'over';
    state.lastWinner = winner;
    state.lastReason = reason;
    state.wins[winner] += 1;
    if (state.wins[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchOver = true;
      state.matchWinner = state.wins.defender > state.wins.attacker ? 'defender'
        : state.wins.attacker > state.wins.defender ? 'attacker' : 'draw';
    }
  }

  function resetMatch() {
    state.round = 1;
    state.wins = { defender: 0, attacker: 0 };
    state.matchOver = false;
    state.matchWinner = null;
    startRound(1);
  }

  return { state, startRound, endRound, resetMatch };
}
