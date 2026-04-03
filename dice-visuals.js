// ===== DICE VISUALIZATION =====

function createDieElement(value) {
  const die = document.createElement('div');
  die.className = 'die rolling';
  die.setAttribute('data-value', value);
  for (let i = 0; i < value; i++) {
    const dot = document.createElement('div');
    dot.className = 'die-dot';
    die.appendChild(dot);
  }
  setTimeout(() => die.classList.remove('rolling'), 500);
  return die;
}

function createD3Element(value) {
  const die = document.createElement('div');
  die.className = 'die d3 rolling';
  die.setAttribute('data-value', value);
  for (let i = 0; i < value; i++) {
    const dot = document.createElement('div');
    dot.className = 'die-dot';
    die.appendChild(dot);
  }
  setTimeout(() => die.classList.remove('rolling'), 500);
  return die;
}

/** Red die with white dots — shows powershot bonus that will hit the opponent */
function createPowerDieElement(value) {
  const die = document.createElement('div');
  die.className = 'die power-die rolling';
  die.setAttribute('data-value', value);
  for (let i = 0; i < value; i++) {
    const dot = document.createElement('div');
    dot.className = 'die-dot power-dot';
    die.appendChild(dot);
  }
  setTimeout(() => die.classList.remove('rolling'), 500);
  return die;
}

/**
 * Display dice roll for a player.
 * @param {number} powershotBonus - pre-rolled powershot bonus die (0 if none)
 */
function displayDiceRoll(playerIndex, diceValues, total, fatigue, skillCheck, d3Value = 0, powershotBonus = 0) {
  const playerDiceEl = document.getElementById(playerIndex === 0 ? 'player1-dice' : 'player2-dice');
  if (!playerDiceEl) return;

  const diceDisplay = playerDiceEl.querySelector('.dice-display');
  diceDisplay.innerHTML = '';

  // Skill check dice
  diceValues.forEach(v => diceDisplay.appendChild(createDieElement(v)));
  if (d3Value > 0) diceDisplay.appendChild(createD3Element(d3Value));

  // Power die (opponent bonus) — shown separately with a label
  if (powershotBonus > 0) {
    const sep = document.createElement('div');
    sep.className = 'power-die-label';
    sep.textContent = '+ opponent:';
    diceDisplay.appendChild(sep);
    diceDisplay.appendChild(createPowerDieElement(powershotBonus));
  }

  // Info text
  const infoDiv = document.createElement('div');
  infoDiv.className = 'dice-info';
  infoDiv.innerHTML = `
    <div>Roll: 6 + ${diceValues.join(' + ')} = ${total}</div>
    <div>Fatigue: -${fatigue}</div>
    ${d3Value > 0 ? `<div style="color:#cc0000;">Complex: -${d3Value} (d3)</div>` : ''}
    <div class="dice-total">Skill Check: ${skillCheck}</div>
    ${powershotBonus > 0 ? `<div class="power-die-info">⚡ Opponent +${powershotBonus} incoming</div>` : ''}
  `;
  diceDisplay.appendChild(infoDiv);
}
