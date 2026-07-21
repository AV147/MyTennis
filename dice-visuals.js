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

  // Who rolled — only meaningful when both players share one block
  if (window.DICE_SINGLE_TARGET && typeof players !== 'undefined' && players[playerIndex]) {
    const who = document.createElement('div');
    who.className = 'dice-roller';
    who.textContent = players[playerIndex].name;
    diceDisplay.appendChild(who);
  }

  // Skill check dice
  diceValues.forEach(v => diceDisplay.appendChild(createDieElement(v)));
  if (d3Value > 0) diceDisplay.appendChild(createD3Element(d3Value));

  // Power die (opponent bonus) — shown separately with a label
  if (powershotBonus > 0) {
    const sep = document.createElement('div');
    sep.className = 'power-die-label';
    sep.textContent = '+ сопернику:';
    diceDisplay.appendChild(sep);
    diceDisplay.appendChild(createPowerDieElement(powershotBonus));
  }

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
