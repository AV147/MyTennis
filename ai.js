// ===== AI DISPATCHER =====
// Shared infrastructure: scheduling, auto mode, pass turn, version selection.
// Routes aiPlayTurn() to whichever engine (AIv1 / AIv2) is selected per player.

const AI_TURN_DELAY_MS = 700;

const AI_ENGINES = { 1: AIv1, 2: AIv2, 3: AIv3 };

// Per-player state
const aiVersion       = [2, 2];     // default to v2 for both players
const aiAutoMode      = [false, false];
const aiTimeoutHandle = [null, null];

function aiGetEngine(playerIndex) {
  return AI_ENGINES[aiVersion[playerIndex]];
}

// ── Version selection ──────────────────────────────────────────────────────

function aiSetVersion(playerIndex, version) {
  aiVersion[playerIndex] = version;
  render(players, currentPlayer, gameLog);
}

// ── Turn execution (dispatches to selected engine) ─────────────────────────

function aiPlayTurn(playerIndex) {
  if (currentPlayer !== playerIndex) return;
  aiGetEngine(playerIndex).playTurn(playerIndex);
}

// ── Auto mode ──────────────────────────────────────────────────────────────

function aiSetAutoMode(playerIndex, enabled) {
  aiAutoMode[playerIndex] = enabled;

  if (!enabled) {
    if (aiTimeoutHandle[playerIndex]) {
      clearTimeout(aiTimeoutHandle[playerIndex]);
      aiTimeoutHandle[playerIndex] = null;
    }
    log(`${players[playerIndex].name}: AI auto mode OFF`);
    render(players, currentPlayer, gameLog);
  } else {
    log(`${players[playerIndex].name}: AI v${aiVersion[playerIndex]} auto mode ON`);
    render(players, currentPlayer, gameLog);
    aiScheduleNext(playerIndex);
  }
}

function aiScheduleNext(playerIndex) {
  if (aiTimeoutHandle[playerIndex])  return; // already scheduled
  if (!aiAutoMode[playerIndex])      return;
  if (currentPlayer !== playerIndex) return;

  aiTimeoutHandle[playerIndex] = setTimeout(() => {
    aiTimeoutHandle[playerIndex] = null;
    if (!aiAutoMode[playerIndex])      return;
    if (currentPlayer !== playerIndex) return;
    aiPlayTurn(playerIndex);
  }, AI_TURN_DELAY_MS);
}

/**
 * Called at the end of every render().
 * Pauses if a human opponent still has a reposition pending.
 */
function aiCheckAutoTrigger() {
  const idx = currentPlayer;
  if (!aiAutoMode[idx]) return;

  const pendingIdx = canDiscardForPosition;
  if (pendingIdx !== -1 && pendingIdx !== idx && !aiAutoMode[pendingIdx]) return;

  aiScheduleNext(idx);
}

/**
 * Called by the Pass Turn button — clears reposition window, lets AI proceed.
 */
function aiPassTurn(humanPlayerIndex) {
  canDiscardForPosition = -1;
  render(players, currentPlayer, gameLog);
}
