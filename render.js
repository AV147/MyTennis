// ===== UI RENDERING =====

function render(players, currentPlayer, gameLog) {
  const p1El    = document.getElementById('player1');
  const p2El    = document.getElementById('player2');
  const logEl   = document.getElementById('log');
  const scoreEl = document.getElementById('tennis-score');

  if (!p1El || !p2El || !logEl) { console.warn('Missing layout elements'); return; }

  // Score bar
  if (scoreEl) {
    const serveNote = serveAttempt === 2 ? ' | ⚠️ 2nd Serve' : '';
    scoreEl.innerHTML = `
      <span class="score-label">Score:</span>
      <span class="score-points">${formatTennisScore()}</span>
      &nbsp;|&nbsp;
      <span class="score-label">Games:</span>
      <span class="score-games">P1: ${gamesWon[0]} — P2: ${gamesWon[1]}</span>
      &nbsp;|&nbsp;
      <span class="score-server">🎾 Serving: ${players[servingPlayer].name}${serveNote}</span>
    `;
  }

  // Current turn panel
  renderCurrentTurnPanel();

  const fatigueLabel = FATIGUE_SYSTEM === 1 ? 'V1 (per shot)' : 'V2 (per draw/OOP)';

  function positionButtons(playerIndex, cardIdx) {
    if (canDiscardForPosition !== playerIndex) return '';
    const player = players[playerIndex];
    const opts = ['BR', 'BL', 'Net']
      .filter(pos => pos !== player.position)
      .map(pos => `<button class="position-btn" onclick="discardForPosition(${playerIndex},${cardIdx},'${pos}')">→ ${pos}</button>`)
      .join('');
    return opts ? `<div class="discard-move"><em>Move:</em> ${opts}</div>` : '';
  }

  function renderAiControls(playerIndex) {
    const isAuto      = aiAutoMode[playerIndex];
    const oppIsAuto   = aiAutoMode[1 - playerIndex];
    const isMyTurn    = currentPlayer === playerIndex;
    const canPassTurn = !isAuto && oppIsAuto && canDiscardForPosition === playerIndex;
    const ver         = aiVersion[playerIndex];

    const passTurnBtn = canPassTurn
      ? `<button class="ai-btn ai-btn-pass" onclick="aiPassTurn(${playerIndex})"
           title="Finish repositioning and let AI proceed">✓ Pass Turn</button>`
      : '';

    return `
      <div class="ai-controls">
        <span class="ai-label">🤖 AI</span>
        <span class="ai-version-toggle">
          <button class="ai-ver-btn ${ver === 1 ? 'ai-ver-active' : ''}"
            onclick="aiSetVersion(${playerIndex}, 1)" ${isAuto ? 'disabled' : ''}>v1</button>
          <button class="ai-ver-btn ${ver === 2 ? 'ai-ver-active' : ''}"
            onclick="aiSetVersion(${playerIndex}, 2)" ${isAuto ? 'disabled' : ''}>v2</button>
          <button class="ai-ver-btn ${ver === 3 ? 'ai-ver-active' : ''}"
            onclick="aiSetVersion(${playerIndex}, 3)" ${isAuto ? 'disabled' : ''}>v3</button>
        </span>
        ${passTurnBtn}
        <button class="ai-btn ai-btn-turn"
          onclick="aiPlayTurn(${playerIndex})"
          ${isAuto || !isMyTurn ? 'disabled' : ''}
          title="AI plays one turn">▶ 1 Turn</button>
        <button class="ai-btn ${isAuto ? 'ai-btn-stop' : 'ai-btn-auto'}"
          onclick="aiSetAutoMode(${playerIndex}, ${!isAuto})"
          title="${isAuto ? 'Stop AI' : 'AI plays all turns for this player'}">
          ${isAuto ? '⏹ Stop AI' : '⏩ Auto Play'}</button>
      </div>`;
  }

  function renderPlayerPanel(player, playerIndex) {
    const isActive = currentPlayer === playerIndex;
    const isAuto   = aiAutoMode[playerIndex];

    // When auto mode is on, show card backs instead of card details
    let cardHtml;
    if (isAuto) {
      cardHtml = player.hand.map(() => `
        <div class="card card-hidden">
          <div class="card-back-face">🂠</div>
        </div>`).join('');
    } else {
      cardHtml = player.hand.map((card, idx) => {
        const playable  = isCardPlayable(card, player, incomingPower, incomingCard);
        const category  = getCardCategory(card);
        const dimmed    = '';
        const isMarked  = isActive && markedCardIndices[playerIndex] === idx;
        const canMark   = isActive && card.type !== 'serve' && incomingPower > 0;
        const markClass = isMarked && card.color ? `card-marked-${card.color}` : '';

        const badges = [
          card.guided    && '<span class="badge badge-guided">Guided</span>',
          card.powershot && '<span class="badge badge-power">+1d6</span>',
          card.complex   && '<span class="badge badge-complex">Complex</span>',
          card.dropshot  && '<span class="badge badge-drop">Drop</span>',
          card.approach  && '<span class="badge badge-approach">Approach</span>',
          card.smashable && '<span class="badge badge-smash">Smashable</span>',
          card.antiNet   && '<span class="badge badge-anti">Anti-Net</span>',
          card.volley    && '<span class="badge badge-volley">Volley</span>',
          card.overhead  && '<span class="badge badge-overhead">Overhead</span>',
        ].filter(Boolean).join('');

        const playBtn = isActive
          ? `<button class="play-btn${!playable ? ' play-btn-disabled' : ''}"
               onclick="playCard(${playerIndex},${idx})"
               ${!playable ? 'disabled' : ''}>${playable ? 'Play' : '✗ Blocked'}</button>`
          : '';

        return `
          <div class="card card-${category} ${dimmed} ${markClass}">
            <strong class="card-name">${card.name}</strong>
            <p class="card-desc">${card.description}</p>
            <div class="card-stats"><span>⚡${card.power}</span><span>🌀${card.spin}</span></div>
            ${badges ? `<div class="card-badges">${badges}</div>` : ''}
            ${canMark ? `
              <label class="mark-checkbox-row" title="Discard this card alongside your next play for a bonus effect">
                <input type="checkbox"
                  onchange="markCardForDiscard(${playerIndex}, ${idx}, this.checked)"
                  ${isMarked ? 'checked' : ''}>
                <span class="mark-label-text mark-label-${card.color}">
                  ${card.color === 'red'  ? '🔴 +2 Power'  :
                    card.color === 'blue' ? '🔵 +1 Spin'   :
                                            '🟢 Free Draw'}
                </span>
              </label>` : ''}
            ${playBtn}
            ${positionButtons(playerIndex, idx)}
          </div>`;
      }).join('');
    }

    const drawBtn = isActive && !isAuto
      ? `<button class="draw-btn" onclick="manualDrawCard(${playerIndex})">Draw (${player.hand.length}/${HAND_SIZE})</button>`
      : '';

    const posLabel = player.inPosition
      ? '<span class="in-pos">✓ IN</span>'
      : '<span class="out-pos">✗ OUT</span>';

    return `
      <h2 class="player-title">${player.name}${isActive ? ' <span class="turn-badge">Ход</span>' : ''}${isAuto ? ' <span class="ai-badge">🤖 AI v' + aiVersion[playerIndex] + '</span>' : ''}</h2>
      <div class="player-stats">
        <span><strong>Fatigue:</strong> ${player.fatigue} <em>[${fatigueLabel}]</em></span>
        <span><strong>Pos:</strong> ${player.position} ${posLabel}</span>
        <span><strong>Deck:</strong> ${player.deck.length} | <strong>Disc:</strong> ${player.discard.length}</span>
      </div>
      ${renderAiControls(playerIndex)}
      ${drawBtn}
      <div class="hand">${cardHtml}</div>`;
  }

  p1El.innerHTML = renderPlayerPanel(players[0], 0);
  p2El.innerHTML = renderPlayerPanel(players[1], 1);
  logEl.innerHTML = [...gameLog].reverse().join('<br>');

  const shiftToCenter = incomingPower > 0 && incomingCard &&
    !incomingCard.guided &&
    !incomingCard.volley &&
    incomingCard.type !== 'serve' &&
    !incomingCard.dropshot;
  renderCourtPositions(players, currentPlayer, shiftToCenter);

  // Hook: schedule AI move if auto mode is on for current player
  if (typeof aiCheckAutoTrigger === 'function') aiCheckAutoTrigger();
}

function renderCurrentTurnPanel() {
  const el = document.getElementById('current-turn');
  if (!el) return;

  if (!lastTurnInfo) {
    el.innerHTML = `
      <div class="ct-title">Текущий ход</div>
      <div class="ct-empty">— Подача —</div>`;
    return;
  }

  const { playerIndex, cardName, power, spin, baseDifficulty, powershotBonus,
          guided, powershot, complex, dropshot, approach, smashable, antiNet, volley, overhead } = lastTurnInfo;

  const arrow = playerIndex === 0
    ? `<span class="ct-p ct-p1">P1</span><span class="ct-arrow">&gt;&gt;&gt;&gt;</span><span class="ct-p ct-p2">P2</span>`
    : `<span class="ct-p ct-p1">P1</span><span class="ct-arrow">&lt;&lt;&lt;&lt;</span><span class="ct-p ct-p2">P2</span>`;

  const badges = [
    guided    && '<span class="badge badge-guided">Guided</span>',
    powershot && '<span class="badge badge-power">+1d6</span>',
    complex   && '<span class="badge badge-complex">Complex</span>',
    dropshot  && '<span class="badge badge-drop">Drop</span>',
    approach  && '<span class="badge badge-approach">Approach</span>',
    smashable && '<span class="badge badge-smash">Smashable</span>',
    antiNet   && '<span class="badge badge-anti">Anti-Net</span>',
    volley    && '<span class="badge badge-volley">Volley</span>',
    overhead  && '<span class="badge badge-overhead">Overhead</span>',
  ].filter(Boolean).join('');

  const total = baseDifficulty + powershotBonus;
  const diffHtml = `
    <div class="ct-difficulty">
      <span class="ct-diff-label">Входящая сложность:</span>
      <span class="ct-diff-value">${baseDifficulty}${powershotBonus > 0 ? ` + <span class="ct-power-bonus">⚡${powershotBonus}</span> = ${total}` : ''}</span>
    </div>`;

  el.innerHTML = `
    <div class="ct-title">Текущий ход</div>
    <div class="ct-arrow-row">${arrow}</div>
    <div class="ct-card-name">${cardName}</div>
    <div class="ct-card-stats"><span>⚡${power}</span><span>🌀${spin}</span></div>
    ${badges ? `<div class="card-badges">${badges}</div>` : ''}
    ${diffHtml}
  `;
}
