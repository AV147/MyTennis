// ===== SHOT RESOLUTION =====

/**
 * Roll multiple d6 dice and optionally a d3.
 * Total includes a fixed +6 base (minimum skill floor).
 */
function rollDice(numDice, rollD3 = false) {
  const diceValues = [];
  let total = 6; // fixed base

  for (let i = 0; i < numDice; i++) {
    const value = Math.floor(Math.random() * 6) + 1;
    diceValues.push(value);
    total += value;
  }

  const d3Value = rollD3 ? Math.floor(Math.random() * 3) + 1 : 0;
  return { total, diceValues, d3Value };
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

  // V2 fatigue: being out of position costs extra on this shot's skill check
  const increments = getFatigueIncrements();
  const fatigueForThisShot = player.fatigue + (!player.inPosition && increments.v2 > 0 ? increments.v2 : 0);

  const shotPower = card.power + bonusPower;
  const shotSpin  = card.spin  + bonusSpin;

  let incomingComplexity = 0;
  const outgoingComplexity = shotPower - shotSpin;

  if (card.type !== 'serve') {
    incomingComplexity = incomingPower + incomingSpin + incomingPowershotBonus;
  }

  const guidedPenalty   = card.guided ? 1 : 0;
  const totalComplexity = incomingComplexity + outgoingComplexity + guidedPenalty;

  const numDice = player.inPosition ? 2 : 1;
  const { total: diceRoll, diceValues, d3Value } = rollDice(numDice, card.complex);
  const skillCheck = diceRoll - fatigueForThisShot - d3Value;

  // Critical success/failure — override all other calculations
  // 2 dice: [6,6] always succeeds, [1,1] always fails
  // 1 die:  6 always succeeds,     1 always fails
  let success;
  if (numDice === 2) {
    const isCritS = diceValues[0] === 6 && diceValues[1] === 6;
    const isCritF = diceValues[0] === 1 && diceValues[1] === 1;
    success = isCritS || (!isCritF && skillCheck >= totalComplexity);
  } else {
    success = diceValues[0] === 6 || (diceValues[0] !== 1 && skillCheck >= totalComplexity);
  }

  player.lastShotInfo = {
    shotPower,
    shotSpin,
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
