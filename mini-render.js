// ===== MINI RENDER: Simplified UI for mobile =====

/**
 * Minimal render function for mini game.
 * Only updates the 4 essential sections:
 * 1. Score
 * 2. Court (uses existing renderCourtPositions)
 * 3. Dice + Last shot
 * 4. Player hand
 * + Log
 */
function miniRender(players, currentPlayer, gameLog) {
  const scoreEl = document.getElementById('tennis-score');
  const logEl = document.getElementById('log');
  const handEl = document.getElementById('mini-hand');

  if (!scoreEl || !logEl || !handEl) {
    console.warn('Missing mini layout elements');
    return;
  }

  // ===== Score Bar =====
  const serveNote = serveAttempt === 2 ? ' | ⚠️ 2nd Serve' : '';
  scoreEl.innerHTML = `
    <div><strong>${formatTennisScore()}</strong> | Games: P1 ${gamesWon[0]} — P2 ${gamesWon[1]}</div>
    <div style="font-size: 11px; color: #a9dfbf;">Serving: ${players[servingPlayer].name}${serveNote}</div>
  `;

  // ===== Court Positions =====
  const shiftToCenter = incomingPower > 0 && incomingCard &&
    !incomingCard.guided &&
    !incomingCard.volley &&
    incomingCard.type !== 'serve' &&
    !incomingCard.dropshot;
  renderCourtPositions(players, currentPlayer, shiftToCenter);

  // ===== Dice Display =====
  miniRenderDice();

  // ===== Last Shot Info =====
  miniRenderLastShot();

  // ===== Player Hand =====
  miniRenderHand(players[0], 0, currentPlayer);

  // ===== Game Log =====
  logEl.innerHTML = [...gameLog].reverse().slice(0, 50)
    .map(msg => `<div>${msg}</div>`)
    .join('');

  // ===== Update Button States =====
  miniUpdateControls(players[0], currentPlayer);

  // Auto-trigger AI if needed
  if (typeof aiCheckAutoTrigger === 'function') aiCheckAutoTrigger();
}

/**
 * Render dice for both players in compact format
 */
function miniRenderDice() {
  const p1DiceEl = document.getElementById('player1-dice');
  const p2DiceEl = document.getElementById('player2-dice');

  if (!p1DiceEl || !p2DiceEl) return;

  // Clear existing
  p1DiceEl.querySelector('.dice-display').innerHTML = '';
  p2DiceEl.querySelector('.dice-display').innerHTML = '';

  // Display stats from last shot if available
  if (lastTurnInfo) {
    const targetEl = lastTurnInfo.playerIndex === 0 ? p1DiceEl : p2DiceEl;
    const diceDisplay = targetEl.querySelector('.dice-display');
    
    // Show power + spin as simplified display
    const powerDie = createMinimalDie(Math.min(lastTurnInfo.power || 0, 6) || 1);
    const spinDie = createMinimalDie(Math.min(lastTurnInfo.spin || 0, 6) || 1);
    diceDisplay.appendChild(powerDie);
    const sep = document.createElement('span');
    sep.style.cssText = 'font-size:10px;color:#999;margin:0 2px;';
    sep.textContent = '+';
    diceDisplay.appendChild(sep);
    diceDisplay.appendChild(spinDie);
  }
}

function createMinimalDie(value) {
  const die = document.createElement('div');
  die.className = 'die';
  die.setAttribute('data-value', value);
  for (let i = 0; i < value; i++) {
    const dot = document.createElement('div');
    dot.className = 'die-dot';
    die.appendChild(dot);
  }
  return die;
}

/**
 * Render last played card for both players
 */
function miniRenderLastShot() {
  const p1El = document.getElementById('p1-last-shot');
  const p2El = document.getElementById('p2-last-shot');

  if (!p1El || !p2El) return;

  let p1Html = '—';
  let p2Html = '—';

  if (lastTurnInfo) {
    const { playerIndex, cardName, power, spin } = lastTurnInfo;
    const html = `<div style="font-weight:bold;">${cardName}</div><div>⚡${power} 🌀${spin}</div>`;

    if (playerIndex === 0) p1Html = html;
    else p2Html = html;
  }

  p1El.innerHTML = p1Html;
  p2El.innerHTML = p2Html;
}

/**
 * Render player's hand (P1 only)
 */
function miniRenderHand(player, playerIndex, currentPlayer) {
  const handEl = document.getElementById('mini-hand');
  if (!handEl) return;

  handEl.innerHTML = '';

  player.hand.forEach((card, idx) => {
    const isPlayable = isCardPlayable(card, player, incomingPower, incomingCard);
    const category = getCardCategory(card);
    const isMarked = markedCardIndices[playerIndex] === idx;

    const cardEl = document.createElement('div');
    cardEl.className = `mini-card card-${category} ${isPlayable ? '' : 'card-blocked'}`;
    if (isMarked && card.color) {
      cardEl.classList.add(`card-marked-${card.color}`);
    }

    cardEl.onclick = () => {
      if (isPlayable && currentPlayer === playerIndex) {
        playCard(playerIndex, idx);
      }
    };

    const pow = card.power || 0;
    const spin = card.spin || 0;
    const badges = [];
    if (card.powershot) badges.push('+1d6');
    if (card.complex) badges.push('Complex');
    if (card.dropshot) badges.push('Drop');

    cardEl.innerHTML = `
      <div class="mini-card-name">${card.name}</div>
      <div class="mini-card-stats">⚡${pow} 🌀${spin}</div>
      ${badges.length > 0 ? `<div class="mini-card-badge">${badges[0]}</div>` : ''}
    `;

    handEl.appendChild(cardEl);
  });
}

/**
 * Update button visibility & state
 */
function miniUpdateControls(player, currentPlayer) {
  const drawBtn = document.getElementById('draw-btn');
  const passBtn = document.getElementById('pass-btn');
  const handStatus = document.getElementById('hand-status');

  if (!drawBtn || !passBtn || !handStatus) return;

  const isPlayerTurn = currentPlayer === 0; // P1 only
  const canDrawCard = isPlayerTurn && player.hand.length < HAND_SIZE && incomingPower > 0;
  const canPass = canDiscardForPosition === 0; // repositioning phase

  drawBtn.style.display = isPlayerTurn && incomingPower > 0 ? 'block' : 'none';
  drawBtn.disabled = !canDrawCard;
  drawBtn.textContent = `Draw (${player.hand.length}/${HAND_SIZE})`;

  passBtn.style.display = canPass ? 'block' : 'none';

  if (isPlayerTurn && incomingPower > 0) {
    handStatus.textContent = canDrawCard ? 'Draw or Play' : 'Play a card';
  } else if (!isPlayerTurn) {
    handStatus.textContent = 'AI playing...';
  } else {
    handStatus.textContent = 'Waiting for serve...';
  }
}

/**
 * Hook: called by game.js on card play, shot resolution, etc.
 * Triggers miniRender() after state changes
 */
function onGameStateChanged() {
  miniRender(players, currentPlayer, gameLog);
}

// ===== Manual Action Handlers for Mini UI =====

function handleMiniDraw() {
  if (currentPlayer === 0 && incomingPower > 0) {
    manualDrawCard(0);
  }
}

function handleMiniPass() {
  if (canDiscardForPosition === 0) {
    aiPassTurn(0);
  }
}
