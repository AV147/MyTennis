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
      <span class="score-server">🎾 Подаёт: ${players[servingPlayer].name}${serveNote}</span>
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
      .map(pos => `<button class="position-btn" onclick="discardForPosition(${playerIndex},${cardIdx},'${pos}')">→ ${formatPosition(pos)}</button>`)
      .join('');
    return opts ? `<div class="discard-move"><em>Перебежать:</em> ${opts}</div>` : '';
  }

  function renderAiControls(playerIndex) {
    const isAuto      = aiAutoMode[playerIndex];
    const oppIsAuto   = aiAutoMode[1 - playerIndex];
    const isMyTurn    = currentPlayer === playerIndex;
    const canPassTurn = !isAuto && oppIsAuto && canDiscardForPosition === playerIndex;
    const ver         = aiVersion[playerIndex];

    const passTurnBtn = canPassTurn
      ? `<button class="ai-btn ai-btn-pass" onclick="aiPassTurn(${playerIndex})"
           title="Finish repositioning and let AI proceed">✓ Передать ход</button>`
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
    // While the point-end pause is on, the board is frozen: no play/draw/mark,
    // only the "Новый розыгрыш" button.
    const canAct   = isActive && !pendingPointEnd;

    // When auto mode is on, show card backs instead of card details
    // (unless AI_HAND_HIDDEN is turned off, e.g. in old_index.html for debugging)
    let cardHtml;
    if (isAuto && AI_HAND_HIDDEN) {
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
        const canMark   = canAct && card.type !== 'serve' && incomingPower > 0;
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

        // A card marked for active discard cannot be played itself — uncheck first
        const playBtn = canAct
          ? (isMarked
              ? `<button class="play-btn play-btn-disabled" disabled>🔒 В сбросе</button>`
              : `<button class="play-btn${!playable ? ' play-btn-disabled' : ''}"
                   onclick="playCard(${playerIndex},${idx})"
                   ${!playable ? 'disabled' : ''}>${playable ? '▶ Играть' : '✗ Блок'}</button>`)
          : '';

        return `
          <div class="card card-${category} ${dimmed} ${markClass}" onclick="handleCardTap(event, ${playerIndex}, ${idx})">
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
                  ${card.color === 'red'  ? '🔴 +2 Силы'  :
                    card.color === 'blue' ? '🔵 +1 Спин'  :
                                            '🟢 Добор'}
                </span>
              </label>` : ''}
            ${playBtn}
            ${positionButtons(playerIndex, idx)}
          </div>`;
      }).join('');
    }

    const drawBtn = canAct && !isAuto
      ? `<button class="draw-btn" onclick="manualDrawCard(${playerIndex})">🃏 Добор (${player.hand.length}/${HAND_SIZE})</button>`
      : '';

    // Point-end pause: replaces Draw/Pass until the next point is confirmed
    const newPointBtn = pendingPointEnd && !isAuto
      ? `<button class="draw-btn new-point-btn" onclick="confirmNewPoint()">🎾 Новый розыгрыш</button>`
      : '';

    const posLabel = player.inPosition
      ? '<span class="in-pos">✓ В позиции</span>'
      : '<span class="out-pos">✗ Вне позиции</span>';

    const aiBadgeLabel = { 1: 'ИИ v1', 2: 'ИИ: Легко', 3: 'ИИ: Сложно' }[aiVersion[playerIndex]]
      || ('ИИ v' + aiVersion[playerIndex]);

    return `
      <h2 class="player-title">${player.name}${isActive ? ' <span class="turn-badge">Ход</span>' : ''}${isAuto ? ' <span class="ai-badge">🤖 ' + aiBadgeLabel + '</span>' : ''}</h2>
      <div class="player-stats">
        <span class="st-fat"><strong>Усталость:</strong> ${player.fatigue} <em>[${fatigueLabel}]</em></span>
        <span class="st-pos">${formatPosition(player.position)} ${posLabel}</span>
        <span class="st-deck"><strong>Колода:</strong> ${player.deck.length} | <strong>Сброс:</strong> ${player.discard.length}</span>
        <span class="st-hand"><strong>Рука:</strong> ${player.hand.length}</span>
      </div>
      ${renderAiControls(playerIndex)}
      ${newPointBtn}${drawBtn}
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

  // Hook: refresh the mobile event log (index.html only)
  if (typeof renderMobileLog === 'function') renderMobileLog();

  // Hook: schedule AI move if auto mode is on for current player
  if (typeof aiCheckAutoTrigger === 'function') aiCheckAutoTrigger();
}

// ===== CARD DETAIL SHEET (mobile) ==========================================
// Tapping a card's body (not its buttons) opens a bottom sheet that explains
// the card's stats and every special property in plain Russian. index.html
// provides #card-overlay; old_index.html doesn't — there this is a no-op.

function handleCardTap(event, playerIndex, cardIndex) {
  if (!document.getElementById('card-overlay')) return;
  if (event.target.closest('button, input, label')) return;
  showCardSheet(playerIndex, cardIndex);
}

function cardPropertyRows(card) {
  const rows = [];
  const add = (icon, title, text) =>
    rows.push(`<div class="cs-prop"><span class="cs-prop-icon">${icon}</span><div><strong>${title}</strong> — ${text}</div></div>`);

  add('⚡', `Сила ${card.power}`,
    'входит в сложность удара для соперника (Сила + Спин) и в вашу собственную сложность исполнения (Сила − Спин): чем сильнее бьёте, тем труднее и вам.');
  add('🌀', `Спин ${card.spin}`,
    'усложняет приём сопернику (Сила + Спин), а вам облегчает исполнение (вычитается из вашей сложности).');

  if (card.type === 'serve')
    add('🎾', 'Подача', 'разыгрывается только в начале розыгрыша. Даётся две попытки: ошибка на обеих — очко сопернику.');
  if (card.guided)
    add('🎯', 'Прицельный (Guided)', '+1 к вашей сложности исполнения — удар труднее, зато летит точно по выбранному направлению.');
  if (card.complex)
    add('🎲', 'Сложный (Complex)', 'из вашего броска дополнительно вычитается 1к3.');
  if (card.powershot)
    add('💥', 'Мощный удар (+1к6)', 'после успеха бросается красный кубик — его значение добавляется к сложности следующего удара соперника.');
  if (card.dropshot)
    add('🪶', 'Укороченный (Drop)', 'соперник вынужден бежать к сетке — он окажется вне позиции, если не стоял у сетки в момент удара.');
  if (card.approach)
    add('🏃', 'Выход к сетке (Approach)', 'после успешного удара вы сразу занимаете зону Сетка.');
  if (card.smashable)
    add('☁️', 'Свеча (Smashable)', 'соперник может ответить на этот удар смэшем (Overhead).');
  if (card.antiNet)
    add('🛡️', 'Анти-сетка (Anti-Net)', 'выбивает из позиции даже соперника, стоящего у сетки.');
  if (card.volley)
    add('🥅', 'Слёта (Volley)', 'играется только стоя у сетки.');
  if (card.overhead)
    add('🔨', 'Смэш (Overhead)', 'играется только в ответ на удар с меткой Smashable; можно играть у сетки.');
  if (card.direction === 'line')
    add('↔️', 'По линии', 'соперник окажется вне позиции, если стоит в той же зоне, что и вы.');
  if (card.direction === 'cross')
    add('⤢', 'По диагонали', 'соперник окажется вне позиции, если стоит в другой зоне, чем вы.');
  if (card.target)
    add('📍', `Цель: ${formatPosition(card.target)}`, 'соперник окажется вне позиции, если стоит не в этой зоне.');
  if (card.targetOpposite)
    add('📍', 'В свободный угол', 'всегда целится туда, где соперника нет — он вне позиции, если не стоит у сетки.');

  if (card.color === 'red')
    add('🔴', 'Красная карта', 'можно сбросить вместе с другим ударом (отметьте её галочкой) — тот получит +2 к Силе.');
  if (card.color === 'blue')
    add('🔵', 'Синяя карта', 'можно сбросить вместе с другим ударом — тот получит +1 к Вращению.');
  if (card.color === 'green')
    add('🟢', 'Зелёная карта', 'можно сбросить вместе с другим ударом — после удара вы бесплатно доберёте карту.');

  return rows.join('');
}

function showCardSheet(playerIndex, cardIndex) {
  const overlay = document.getElementById('card-overlay');
  const card = players[playerIndex] && players[playerIndex].hand[cardIndex];
  if (!overlay || !card) return;

  const catLabel = { serve: 'Подача', volley: 'Volley', attack: 'Атака', defense: 'Защита' }[getCardCategory(card)];
  document.getElementById('card-sheet-body').innerHTML = `
    <div class="cs-head-row">
      <strong class="cs-name">${card.name}</strong>
      <span class="cs-cat cs-cat-${getCardCategory(card)}">${catLabel}</span>
    </div>
    <p class="cs-desc">${card.description}</p>
    <div class="cs-props">${cardPropertyRows(card)}</div>`;
  overlay.classList.add('open');
  if (typeof window !== 'undefined' && window.__tutorialNotify) window.__tutorialNotify('cardsheet-open');
}

function closeCardSheet() {
  const overlay = document.getElementById('card-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  if (typeof window !== 'undefined' && window.__tutorialNotify) window.__tutorialNotify('cardsheet-close');
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

  const { playerIndex, cardName, power, spin, baseDifficulty, powershotBonus, missed,
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

  const missBadge = missed ? '<span class="ct-miss">✗ Промах</span>' : '';

  el.innerHTML = `
    <div class="ct-head">
      <div class="ct-title">Текущий ход</div>
      <div class="ct-arrow-row">${arrow}</div>
    </div>
    <div class="ct-name-row">
      <span class="ct-card-name">${cardName}</span>
      <span class="ct-card-stats">${missBadge}<span>⚡${power}</span><span>🌀${spin}</span></span>
    </div>
    ${badges ? `<div class="card-badges">${badges}</div>` : ''}
    ${diffHtml}
  `;
}
