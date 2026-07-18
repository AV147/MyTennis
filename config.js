// ===== GAME CONFIGURATION =====

const STARTING_VALUES = {
  fatigue: 0,
  position: 'BR',
  inPosition: true
};

const HAND_SIZE = 5;

// When true, an AI player's hand is hidden (card backs only) while auto mode
// is on — this keeps index.html fair for a human opponent. old_index.html
// overrides this to false so AI hands stay visible for debugging draw logic.
let AI_HAND_HIDDEN = true;

// Fatigue system: 1 = fatigue per shot played, 2 = fatigue per draw / out-of-position
let FATIGUE_SYSTEM = 2;

function getFatigueIncrements() {
  return {
    v1: FATIGUE_SYSTEM === 1 ? 1 : 0,
    v2: FATIGUE_SYSTEM === 2 ? 1 : 0
  };
}
