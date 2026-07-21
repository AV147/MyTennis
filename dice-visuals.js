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
 * Display a dice roll.
 * @param {number} powershotBonus - pre-rolled powershot bonus die (0 if none)
 * @param {?boolean} success - true/false to show a Успех/Ошибка banner; null to omit
 *
 * When window.DICE_SINGLE_TARGET is set (mobile: 'player1-dice'), every roll —
 * player's or AI's — renders into that one visible block, with a label naming
 * who rolled. Otherwise it targets the roller's own block (old_index, two
 * side-by-side displays).
 */
function displayDiceRoll(playerIndex, diceValues, total, fatigue, skillCheck, d3Value = 0, powershotBonus = 0, success = null) {
  const targetId = (typeof window !== 'undefined' && window.DICE_SINGLE_TARGET)
    ? window.DICE_SINGLE_TARGET
    : (playerIndex === 0 ? 'player1-dice' : 'player2-dice');
  const playerDiceEl = document.getElementById(targetId);
  if (!playerDiceEl) return;

  const diceDisplay = playerDiceEl.querySelector('.dice-display');
  diceDisplay.innerHTML = '';

  // On the shared mobile block, name the roller in the header: "🎲 Бросок — Игрок 2"
  const rollerName = (typeof players !== 'undefined' && players[playerIndex]) ? players[playerIndex].name : '';
  if (window.DICE_SINGLE_TARGET) {
    const label = playerDiceEl.querySelector('.app-dice-label');
    if (label) label.innerHTML = '🎲 Бросок' + (rollerName ? ` — <span class="dice-roller">${rollerName}</span>` : '');
  }

  // Dice faces in a horizontal row (skill dice, then d3, then the red power die)
  const faces = document.createElement('div');
  faces.className = 'dice-faces';
  diceValues.forEach(v => faces.appendChild(createDieElement(v)));
  if (d3Value > 0) faces.appendChild(createD3Element(d3Value));
  if (powershotBonus > 0) faces.appendChild(createPowerDieElement(powershotBonus));
  diceDisplay.appendChild(faces);

  // Info text
  const infoDiv = document.createElement('div');
  infoDiv.className = 'dice-info';
  infoDiv.innerHTML = `
    <div>Бросок: 6 + ${diceValues.join(' + ')} = ${total}</div>
    <div>Усталость: −${fatigue}</div>
    ${d3Value > 0 ? `<div style="color:#ff7050;">Сложный: −${d3Value} (d3)</div>` : ''}
    <div class="dice-total">Итог: ${skillCheck}</div>
    ${powershotBonus > 0 ? `<div class="power-die-info">⚡ сопернику +${powershotBonus}</div>` : ''}
  `;
  diceDisplay.appendChild(infoDiv);

  // Success / failure banner
  if (success !== null) {
    const res = document.createElement('div');
    res.className = 'dice-result ' + (success ? 'dice-ok' : 'dice-fail');
    res.textContent = success ? '✓ Успех' : '✗ Ошибка';
    diceDisplay.appendChild(res);
  }
}
