// ===== SHOT RESOLUTION =====

/**
 * Roll multiple d6 dice and optionally a d3.
 * Total includes a fixed +6 base (minimum skill floor).
 */
function rollDice(numDice, rollD3 = false) {
  // Scripted roll (tutorial only): a one-shot override the hook consumes here.
  // Absent in old_index.html and in the headless trainer (no `window` there),
  // so both keep rolling normally.
  const s = (typeof window !== 'undefined' && typeof window.__scriptedRoll === 'function')
    ? window.__scriptedRoll()
    : null;

  const diceValues = [];
  let total = 6; // fixed base

  for (let i = 0; i < numDice; i++) {
    const value = (s && s.dice && s.dice[i] != null)
      ? s.dice[i]
      : Math.floor(Math.random() * 6) + 1;
    diceValues.push(value);
    total += value;
  }

  const d3Value = rollD3
    ? ((s && s.d3 != null) ? s.d3 : Math.floor(Math.random() * 3) + 1)
    : 0;
  return { total, diceValues, d3Value };
}

/** The powershot's red 1d6, routed through the same scripted-roll escape hatch. */
function rollPowerDie() {
  const s = (typeof window !== 'undefined' && typeof window.__scriptedPowerDie === 'function')
    ? window.__scriptedPowerDie()
    : null;
  return s != null ? s : Math.floor(Math.random() * 6) + 1;
}

/**
 * Resolve a shot attempt. Writes result to player.lastShotInfo.
 * @param {number} incomingPowershotBonus - pre-rolled bonus from opponent's powershot (0 if none)
 * @returns {{ success: boolean, shotPower: number, shotSpin: number }}
 */
function resolveShot(player, card, incomingPower, incomingSpin, incomingCard = null, incomingPowershotBonus = 0, bonusPower = 0, bonusSpin = 0) {
  // Approach shots negate out-of-position penalty when responding to a dropshot
  const isRespondingToDropshot = incomingCard && incomingCard.dropshot;
  if (card.approach && !player.inPosition && isRespondingToDropshot) {
    player.inPosition = true;
  }
  // The smash (overhead) is always struck as if in position — you set under the
  // high ball, so it never takes the single-die out-of-position penalty.
  if (card.overhead && !player.inPosition) {
    player.inPosition = true;
  }

  // V2 fatigue: being out of position costs extra on this shot's skill check
  const increments = getFatigueIncrements();
  const fatigueForThisShot = player.fatigue + (!player.inPosition && increments.v2 > 0 ? increments.v2 : 0);

  const shotPower = card.power + bonusPower;
  const shotSpin  = card.spin  + bonusSpin;

  let incomingComplexity = 0;
  let incomingPowerUsed = 0, incomingSpinUsed = 0, incomingPowershotBonusUsed = 0;
  const outgoingComplexity = shotPower - shotSpin;

  if (card.type !== 'serve') {
    incomingPowerUsed = incomingPower;
    incomingSpinUsed = incomingSpin;
    incomingPowershotBonusUsed = incomingPowershotBonus;
    incomingComplexity = incomingPowerUsed + incomingSpinUsed + incomingPowershotBonusUsed;
  }

  const guidedPenalty   = card.guided ? 1 : 0;
  const totalComplexity = incomingComplexity + outgoingComplexity + guidedPenalty;

  const numDice = player.inPosition ? 2 : 1;
  const { total: diceRoll, diceValues, d3Value } = rollDice(numDice, card.complex);
  const skillCheck = diceRoll - fatigueForThisShot - d3Value;

  // Critical success/failure — 2 dice only: [6,6] always succeeds, [1,1]
  // always fails. Out of position (1 die) there are no crits at all, just the
  // straight skill check: a single die hits each face 1-in-6, so crits there
  // would fire far too often.
  let success;
  if (numDice === 2) {
    const isCritS = diceValues[0] === 6 && diceValues[1] === 6;
    const isCritF = diceValues[0] === 1 && diceValues[1] === 1;
    success = isCritS || (!isCritF && skillCheck >= totalComplexity);
  } else {
    success = skillCheck >= totalComplexity;
  }

  player.lastShotInfo = {
    shotPower,
    shotSpin,
    incomingPower: incomingPowerUsed,
    incomingSpin: incomingSpinUsed,
    incomingPowershotBonus: incomingPowershotBonusUsed,
    incomingComplexity,
    outgoingComplexity,
    guidedPenalty,
    totalComplexity,
    inPosition: player.inPosition,
    numDice,
    diceRoll,
    diceValues,
    d3Value,
    fatigue: fatigueForThisShot,
    skillCheck,
    success,
  };

  return { success: player.lastShotInfo.success, shotPower, shotSpin };
}
