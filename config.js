// ===== GAME CONFIGURATION =====

const STARTING_VALUES = {
  fatigue: 0,
  position: 'BR',
  inPosition: true
};

const HAND_SIZE = 5;

// Fatigue system: 1 = fatigue per shot played, 2 = fatigue per draw / out-of-position
let FATIGUE_SYSTEM = 2;

function getFatigueIncrements() {
  return {
    v1: FATIGUE_SYSTEM === 1 ? 1 : 0,
    v2: FATIGUE_SYSTEM === 2 ? 1 : 0
  };
}
