// ===== MAIN GAME LOGIC =====

// ===== TENNIS SCORING STATE =====
let tennisP1Points = 0;
let tennisP2Points = 0;
let gamesWon = [0, 0];
let servingPlayer = 0;
let serveAttempt = 1;
let pointCount = 0;

// ===== GLOBAL RALLY STATE =====
const players = [
  createPlayer('Игрок 1', 0),
  createPlayer('Игрок 2', 1)
];

let currentPlayer = 0;
let incomingPower = 0;
let incomingSpin = 0;
let incomingCard = null;
let canDiscardForPosition = -1;

// Powershot bonus pre-rolled by the shooter, consumed by the receiver's resolveShot
let pendingPowershotBonus = 0;

// Active-discard state: index of marked card per player (-1 = none)
let markedCardIndices = [-1, -1];

// Info about the last successfully played shot — drives the Текущий ход panel
let lastTurnInfo = null;

// Point-end pause: after a point ends the board keeps the final positions,
// shot line and dice roll on screen until "Новый розыгрыш" is pressed.
let pendingPointEnd = false;
let pendingGameReshuffle = false;

const gameLog = [];
function log(msg) { gameLog.push(msg); }

// ===== ACTIVE DISCARD MECHANIC =====

function markCardForDiscard(playerIndex, cardIndex, checked) {
  if (pendingPointEnd) return;
  if (checked) {
    markedCardIndices[playerIndex] = cardIndex;
  } else {
    markedCardIndices[playerIndex] = -1;
  }
  render(players, currentPlayer, gameLog);
}

// ===== HELPERS =====

function switchFatigueSystem(system) {
  FATIGUE_SYSTEM = system;
  log(`Switched to Fatigue System V${system}`);
  render(players, currentPlayer, gameLog);
}

function formatPosition(pos) {
  if (pos === 'BR')  return 'Справа';
  if (pos === 'BL')  return 'Слева';
  if (pos === 'Net') return 'Сетка';
  return pos;
}

// Breaks totalComplexity back down into its terms for the log, e.g. "6+3+1".
// Returns null when there's nothing to add beyond the total itself (plain serves).
function formatComplexityBreakdown(info) {
  const hasIncoming = info.incomingPower !== 0 || info.incomingSpin !== 0 || info.incomingPowershotBonus > 0;
  const nums = hasIncoming ? [info.incomingPower, info.incomingSpin] : [];
  if (info.incomingPowershotBonus > 0) nums.push(info.incomingPowershotBonus);
  nums.push(info.outgoingComplexity);
  if (info.guidedPenalty > 0) nums.push(info.guidedPenalty);
  if (nums.length <= 1) return null;
  return nums.map((n, i) => (i === 0 ? `${n}` : n >= 0 ? `+${n}` : `${n}`)).join('');
}

function formatTennisScore() {
  const labels = ['0', '15', '30', '40'];
  const p1 = tennisP1Points;
  const p2 = tennisP2Points;
  if (p1 >= 3 && p2 >= 3) {
    if (p1 === p2) return 'Deuce (40:40)';
    return p1 > p2 ? 'Adv P1 - 40' : '40 - Adv P2';
  }
  return `${labels[Math.min(p1, 3)]} : ${labels[Math.min(p2, 3)]}`;
}

function isCardPlayable(card, player, incPower, incCard) {
  const respondingToDropshot = incCard && incCard.dropshot && player.position !== 'Net';
  if (incPower === 0  && card.type !== 'serve') return false;
  if (incPower > 0   && card.type === 'serve')  return false;
  if (player.position === 'Net' && !card.volley && !card.overhead && !respondingToDropshot) return false;
  if (card.volley  && player.position !== 'Net') return false;
  if (card.overhead && (!incCard || !incCard.smashable)) return false;
  return true;
}

function hasPlayableCards(player) {
  return player.hand.some(c => isCardPlayable(c, player, incomingPower, incomingCard));
}

function isTrulyStuck(player) {
  return player.hand.length >= HAND_SIZE && !hasPlayableCards(player);
}

function getCardCategory(card) {
  if (card.type === 'serve') return 'serve';
  if (card.volley)           return 'volley';
  if (card.powershot || card.overhead || card.approach || card.power >= 5) return 'attack';
  return 'defense';
}

// ===== DRAW / DISCARD ACTIONS =====

function manualDrawCard(playerIndex) {
  if (pendingPointEnd) return;
  if (playerIndex !== currentPlayer) {
    log(`Сейчас не ход ${players[playerIndex].name}!`);
    render(players, currentPlayer, gameLog);
    return;
  }
  const player = players[playerIndex];
  if (player.hand.length >= HAND_SIZE) {
    log(`У ${player.name} уже ${HAND_SIZE} карт!`);
    render(players, currentPlayer, gameLog);
    return;
  }

  const { v2 } = getFatigueIncrements();
  drawCard(player, log);
  log(`${player.name} берёт карту${v2 > 0 ? ' (+1 усталости)' : ''}`);
  markedCardIndices[playerIndex] = -1; // drawing clears any active mark

  if (isTrulyStuck(player)) {
    log(`У ${player.name} полная рука без ходов — очко проиграно!`);
    endPoint(1 - playerIndex);
    render(players, currentPlayer, gameLog);
    return;
  }

  render(players, currentPlayer, gameLog);
}

function discardForPosition(playerIndex, cardIndex, newPosition) {
  if (pendingPointEnd) return;
  if (canDiscardForPosition !== playerIndex) {
    log(`${players[playerIndex].name} сейчас не может сбрасывать для перебежки!`);
    render(players, currentPlayer, gameLog);
    return;
  }
  const player = players[playerIndex];
  if (player.position === newPosition) {
    log(`${player.name} уже ${formatPosition(newPosition)}!`);
    render(players, currentPlayer, gameLog);
    return;
  }

  const card = player.hand.splice(cardIndex, 1)[0];
  player.discard.push(card);
  player.position = newPosition;
  player.inPosition = true;

  const { v2 } = getFatigueIncrements();
  if (v2 > 0) player.fatigue += v2;

  log(`${player.name} сбрасывает ${card.name} и перебегает: ${formatPosition(newPosition)}${v2 > 0 ? ' (+1 усталости)' : ''}`);
  canDiscardForPosition = -1;
  render(players, currentPlayer, gameLog);
}

// ===== POINT / GAME FLOW =====

function startNewPoint() {
  const startPos = pointCount % 2 === 0 ? 'BR' : 'BL';

  players.forEach(p => {
    p.discard.push(...p.hand, ...p.temporaryRemovedServes);
    p.hand = [];
    p.temporaryRemovedServes = [];
    p.inPosition = true;
    p.position = startPos;
    p.fatigue = 0;
    p.positionBeforeDropshot = null;
    p.wasLobbed = false;
  });

  incomingPower = 0;
  incomingSpin = 0;
  incomingCard = null;
  canDiscardForPosition = -1;
  serveAttempt = 1;
  pendingPowershotBonus = 0;
  lastTurnInfo = null;
  markedCardIndices = [-1, -1];

  const server   = players[servingPlayer];
  const returner = players[1 - servingPlayer];

  // Deck persists across points — no reshuffle here.
  // Serves may be anywhere (deck or discard), so search both.

  // Server: pull serves from deck, then from discard
  for (let i = server.deck.length - 1; i >= 0; i--) {
    if (server.deck[i].type === 'serve') server.hand.push(...server.deck.splice(i, 1));
  }
  for (let i = server.discard.length - 1; i >= 0; i--) {
    if (server.discard[i].type === 'serve') server.hand.push(...server.discard.splice(i, 1));
  }
  while (server.hand.length < HAND_SIZE) drawCard(server, log, true);

  // Returner: temporarily remove serves from deck, then from discard
  for (let i = returner.deck.length - 1; i >= 0; i--) {
    if (returner.deck[i].type === 'serve') returner.temporaryRemovedServes.push(...returner.deck.splice(i, 1));
  }
  for (let i = returner.discard.length - 1; i >= 0; i--) {
    if (returner.discard[i].type === 'serve') returner.temporaryRemovedServes.push(...returner.discard.splice(i, 1));
  }
  while (returner.hand.length < HAND_SIZE) drawCard(returner, log, true);

  currentPlayer = servingPlayer;
  pointCount++;

  log(`— Новый розыгрыш | Счёт: ${formatTennisScore()} | Геймы: ${gamesWon[0]}-${gamesWon[1]} | Подаёт: ${server.name} | Старт: ${formatPosition(startPos)} —`);

  if (isTrulyStuck(players[currentPlayer])) {
    log(`У ${players[currentPlayer].name} нет карт для подачи — очко отдано.`);
    endPoint(1 - currentPlayer);
  }
}

function endPoint(winnerIndex) {
  if (winnerIndex === 0) tennisP1Points++;
  else                   tennisP2Points++;

  const p1 = tennisP1Points, p2 = tennisP2Points;
  if ((p1 >= 4 && p1 - p2 >= 2) || (p2 >= 4 && p2 - p1 >= 2)) {
    const winner = p1 > p2 ? 0 : 1;
    gamesWon[winner]++;
    log(`<strong>🎾 ${players[winner].name} выигрывает гейм! Геймы: ${gamesWon[0]}-${gamesWon[1]}</strong>`);
    tennisP1Points = 0;
    tennisP2Points = 0;
    pointCount = 0;
    servingPlayer = 1 - servingPlayer;
    // Deck reshuffle waits for confirmNewPoint so the final board state
    // (hands, positions, shot line, dice) stays on screen during the pause.
    pendingGameReshuffle = true;
  } else {
    log(`<strong>Очко → ${players[winnerIndex].name}! Счёт: ${formatTennisScore()}</strong>`);
  }

  // Freeze the board: the next point starts only when the player presses
  // "Новый розыгрыш" (confirmNewPoint). No repositioning during the pause.
  pendingPointEnd = true;
  canDiscardForPosition = -1;
}

// "Новый розыгрыш" button — actually starts the next point.
function confirmNewPoint() {
  if (!pendingPointEnd) return;
  pendingPointEnd = false;

  if (pendingGameReshuffle) {
    pendingGameReshuffle = false;
    // Reshuffle both decks at the start of each new game (serve switch)
    players.forEach(p => {
      p.discard.push(...p.hand, ...p.temporaryRemovedServes);
      p.hand = [];
      p.temporaryRemovedServes = [];
      p.deck = shuffle([...p.deck, ...p.discard]);
      p.discard = [];
    });
  }

  // Clear the previous point's visuals
  if (typeof currentShotLine !== 'undefined' && currentShotLine) {
    currentShotLine.remove();
    currentShotLine = null;
  }
  if (typeof clearDiceDisplays === 'function') clearDiceDisplays();

  startNewPoint();
  render(players, currentPlayer, gameLog);
}

function startGame() {
  tennisP1Points = 0;
  tennisP2Points = 0;
  gamesWon      = [0, 0];
  servingPlayer = 0;
  serveAttempt  = 1;
  pointCount    = 0;
  pendingPowershotBonus = 0;
  lastTurnInfo  = null;
  pendingPointEnd = false;
  pendingGameReshuffle = false;
  // Shuffle once at game start — decks persist across points from here
  players.forEach((p, idx) => {
    p.deck    = shuffle([...PLAYER_DECKS[idx]]);
    p.discard = [];
    p.hand    = [];
    p.temporaryRemovedServes = [];
  });
  log('=== 🎾 Начало матча ===');
  if (typeof currentShotLine !== 'undefined' && currentShotLine) {
    currentShotLine.remove();
    currentShotLine = null;
  }
  if (typeof clearDiceDisplays === 'function') clearDiceDisplays();
  startNewPoint();
  render(players, currentPlayer, gameLog);
}

// ===== POSITION HELPERS =====

function applyDropshotPositioning(player, card) {
  player.position = 'Net';
  if (card.approach) log(`${player.name} выходит к сетке`);
  player.positionBeforeDropshot = null;
}

function applyNormalPositioning(player, card) {
  // wasLobbed only excuses the very next return — consume it now regardless
  // of outcome, so a later unrelated out-of-position turn isn't affected by it.
  const wasLobbed = player.wasLobbed;
  player.wasLobbed = false;

  if (card.approach) {
    player.position = 'Net';
    log(`${player.name} выходит к сетке`);
    return;
  }
  if (!player.inPosition && card.type === 'return') {
    if (wasLobbed) {
      log(`${player.name} остаётся: ${formatPosition(player.position)}`);
    } else {
      const positionBefore = player.position;
      updatePositionAfterOutOfPositionReturn(player);
      if (player.position !== positionBefore) {
        log(`${player.name} смещается: ${formatPosition(player.position)}`);
      } else {
        log(`${player.name} остаётся: ${formatPosition(player.position)}`);
      }
    }
  }
}

function calcOpponentOutOfPosition(card, shooterPosition, opponent) {
  const dir = getShotDirection(card);
  let oop = willOpponentBeOutOfPosition(shooterPosition, opponent.position, dir);
  if (card.targetOpposite) {
    oop = opponent.position !== 'Net'; // always wrong corner unless at net
  } else if (card.target) {
    oop = opponent.position !== card.target;
  }
  if (!card.targetOpposite && opponent.position === 'Net' && dir !== 'neutral') oop = false;
  if (card.volley && opponent.position === 'Net')    oop = false;
  if (card.antiNet && opponent.position === 'Net') {
    oop = true;
    log(`${card.name} выбивает игрока у сетки из позиции!`);
  }
  if (card.dropshot && opponent.position !== 'Net')  oop = true;
  return oop;
}

// ===== MAIN PLAY ACTION =====

function playCard(playerIndex, cardIndex) {
  if (pendingPointEnd) return;
  const player   = players[playerIndex];
  const opponent = players[1 - playerIndex];
  const card     = player.hand[cardIndex];

  // A card marked for active discard cannot be played itself — uncheck it first
  if (markedCardIndices[playerIndex] === cardIndex) {
    log(`${player.name}: карта ${card.name} помечена на сброс — сначала снимите отметку.`);
    render(players, currentPlayer, gameLog);
    return;
  }

  // Pre-play state: track dropshot response origin
  const respondingToDropshot = incomingCard && incomingCard.dropshot && player.position !== 'Net';
  if (respondingToDropshot) player.positionBeforeDropshot = player.position;

  // Validate
  if (!isCardPlayable(card, player, incomingPower, incomingCard)) {
    if (card.type === 'serve' && incomingPower > 0) {
      log(`${player.name}: нельзя подавать посреди розыгрыша!`);
    } else if (incomingPower === 0 && card.type !== 'serve') {
      log(`${player.name}: сначала нужно подать!`);
    } else if (player.position === 'Net' && !card.volley && !card.overhead && !respondingToDropshot) {
      log(`${player.name}: ${card.name} нельзя играть у сетки!`);
    } else if (card.volley && player.position !== 'Net') {
      log(`${player.name}: ${card.name} — удары слёта только у сетки!`);
    } else if (card.overhead && (!incomingCard || !incomingCard.smashable)) {
      log(`${player.name}: смэш можно только по свече!`);
    }
    render(players, currentPlayer, gameLog);
    return;
  }

  player.hand.splice(cardIndex, 1);
  player.discard.push(card);

  // ===== ACTIVE DISCARD FOR EFFECT =====
  let bonusPower = 0;
  let bonusSpin  = 0;
  let pendingGreenDraw = false;

  const markedIdx = markedCardIndices[playerIndex];
  if (markedIdx !== -1 && markedIdx !== cardIndex && card.type !== 'serve') {
    // A different card is marked — consume it for its color effect
    const activeCard = player.hand[markedIdx > cardIndex ? markedIdx - 1 : markedIdx];
    const color = activeCard ? activeCard.color : null;
    if (color === 'red')   bonusPower = 2;
    if (color === 'blue')  bonusSpin  = 1;
    if (color === 'green') pendingGreenDraw = true;

    // Remove from hand (adjusted for already-removed played card)
    const adjustedIdx = markedIdx > cardIndex ? markedIdx - 1 : markedIdx;
    player.hand.splice(adjustedIdx, 1);
    player.discard.push(activeCard);
    markedCardIndices[playerIndex] = -1;

    const effectDesc = color === 'red'  ? '+2 к силе удара' :
                       color === 'blue' ? '+1 к вращению'   : 'бесплатный добор';
    log(`${player.name} сбрасывает <strong>${activeCard.name}</strong> ради эффекта: ${effectDesc}`);
  } else {
    // Playing the marked card itself, or playing a serve — clear mark, no bonus
    markedCardIndices[playerIndex] = -1;
  }

  // Resolve shot — consume any pending powershot bonus from opponent's last shot
  const { success, shotPower, shotSpin } = resolveShot(
    player, card, incomingPower, incomingSpin, incomingCard, pendingPowershotBonus, bonusPower, bonusSpin
  );
  pendingPowershotBonus = 0; // consumed

  const info = player.lastShotInfo;
  const { v1, v2 } = getFatigueIncrements();

  // Build log strings shared between success/miss
  const posStr   = `${info.inPosition ? 'в позиции' : 'вне позиции'} (${info.numDice}к6)`;
  const cardStat = `(${info.shotPower}/${info.shotSpin})`;
  const breakdown = formatComplexityBreakdown(info);
  const vsStr    = breakdown ? `${info.totalComplexity} (${breakdown})` : `${info.totalComplexity}`;
  const rollStr  = `Бросок ${info.diceRoll} − усталость ${info.fatigue}${info.d3Value > 0 ? ` − d3 ${info.d3Value}` : ''} = <strong>${info.skillCheck}</strong>`;
  const extras   = `${info.d3Value > 0 ? ` | Сложный: −${info.d3Value}` : ''}${info.guidedPenalty > 0 ? ` | Прицельный: +${info.guidedPenalty}` : ''}`;

  // Snapshot for the "Текущий ход" panel — set for both hits and misses so the
  // panel always matches the dice roll on screen.
  function recordTurn(missed, psBonus) {
    lastTurnInfo = {
      playerIndex,
      cardName:       card.name,
      power:          shotPower,
      spin:           shotSpin,
      direction:      card.direction || 'neutral',
      baseDifficulty: shotPower + shotSpin,
      powershotBonus: psBonus || 0,
      isServe:        card.type === 'serve',
      guided:    card.guided,
      powershot: card.powershot,
      complex:   card.complex,
      dropshot:  card.dropshot,
      approach:  card.approach,
      smashable: card.smashable,
      antiNet:   card.antiNet,
      volley:    card.volley,
      overhead:  card.overhead,
      missed:    !!missed,
    };
  }

  if (success) {
    // A sideways out-of-position return means the player runs to the opposite
    // corner and makes contact THERE. The run happens BEFORE the hit, so log it
    // first — the journal then reads in physical order (run, then the shot from
    // the new corner) and the trajectory / opponent-OOP check below use that new
    // corner. Approach and dropshot responses are different: they hit from where
    // they stand and only then advance to the net, handled after the shot.
    const oopSidewaysReturn =
      player.positionBeforeDropshot === null && !card.approach &&
      !player.inPosition && card.type === 'return' && !player.wasLobbed;
    if (oopSidewaysReturn) {
      const before = player.position;
      updatePositionAfterOutOfPositionReturn(player);        // run to the ball
      log(player.position !== before
        ? `${player.name} смещается: ${formatPosition(player.position)}`
        : `${player.name} остаётся: ${formatPosition(player.position)}`);
    }

    // Pre-roll powershot bonus BEFORE display so the red die shows immediately
    if (card.powershot) {
      pendingPowershotBonus = Math.floor(Math.random() * 6) + 1;
    }

    displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0, pendingPowershotBonus, true);

    log(`${player.name} играет <strong>${card.name}</strong> ${cardStat} | ${posStr}${extras}<br>${rollStr} против ${vsStr} ✓${pendingPowershotBonus > 0 ? ` | ⚡ сопернику +${pendingPowershotBonus}` : ''}`);

    player.fatigue += v1;
    if (!player.inPosition) player.fatigue += v2;
    if (card.type === 'serve') serveAttempt = 1;

    // Trajectory + opponent positioning, from the actual point of contact.
    const shotOriginPosition = player.position;
    const playerSide = playerIndex === 0 ? 'p1' : 'p2';
    drawShotLine(shotOriginPosition, getTargetPosition(shotOriginPosition, card.type, card, opponent.position), playerSide);
    opponent.inPosition = !calcOpponentOutOfPosition(card, shotOriginPosition, opponent);

    // Post-hit movement: approach / dropshot advance to the net. The sideways
    // run, if any, already happened above — don't repeat it.
    if (player.positionBeforeDropshot !== null) {
      applyDropshotPositioning(player, card);
    } else if (!oopSidewaysReturn) {
      applyNormalPositioning(player, card);
    } else {
      player.wasLobbed = false; // consumed; applyNormalPositioning skipped
    }

    // Lob: push a net opponent back to a BACK corner. Use the shooter's contact
    // position, not player.position — when the lob answers a dropshot the player
    // has just advanced to the net, so player.position is 'Net' and the opponent
    // would (wrongly) be pushed to the net instead of driven off it.
    if (card.antiNet && card.smashable && opponent.position === 'Net') {
      opponent.position = shotOriginPosition;
      opponent.inPosition = false;
      opponent.wasLobbed = true;
      log(`${opponent.name} отброшен свечкой на ${formatPosition(shotOriginPosition)} (вне позиции)`);
    }

    // Update current-turn info for the panel
    recordTurn(false, pendingPowershotBonus);

    incomingPower = shotPower;
    incomingSpin  = shotSpin;
    incomingCard  = card;
    canDiscardForPosition = playerIndex;
    currentPlayer = 1 - currentPlayer;

    // Green discard free draw — must fire BEFORE isTrulyStuck/endPoint
    // so the draw lands in the current hand, not after startNewPoint resets it to 5
    if (pendingGreenDraw) {
      drawCard(player, log, true); // skipFatigue = true
      log(`${player.name} берёт карту бесплатно (эффект зелёного сброса)`);
    }

    if (isTrulyStuck(players[currentPlayer])) {
      log(`У ${players[currentPlayer].name} полная рука без ходов — очко проиграно!`);
      endPoint(1 - currentPlayer);
    }

    render(players, currentPlayer, gameLog);

  } else {
    // Serve fault
    if (card.type === 'serve') {
      recordTurn(true, 0);
      if (serveAttempt === 1) {
        log(`${player.name} — ОШИБКА подачи <strong>${card.name}</strong> ${cardStat}! Вторая подача.<br>${rollStr} против ${vsStr} ✗`);
        displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0, 0, false);
        serveAttempt = 2;
        if (pendingGreenDraw) {
          drawCard(player, log, true);
          log(`${player.name} берёт карту бесплатно (эффект зелёного сброса)`);
        }
        render(players, currentPlayer, gameLog);
      } else {
        log(`${player.name} — ДВОЙНАЯ ОШИБКА <strong>${card.name}</strong> ${cardStat}! Очко ${players[1 - playerIndex].name}.<br>${rollStr} против ${vsStr} ✗`);
        displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0, 0, false);
        endPoint(1 - playerIndex);
        render(players, currentPlayer, gameLog);
      }
      return;
    }

    // Normal miss. Fatigue is charged on the pre-run in-position state (the
    // reposition helpers below never touch player.inPosition, so reading it
    // after them would be equivalent — kept explicit for clarity).
    const missedOutOfPosition = !player.inPosition;

    // Mirror the success branch: a sideways out-of-position return runs to the
    // opposite corner as part of reaching the ball, so log that move BEFORE the
    // shot line (in Russian) and draw the trajectory from the new corner.
    const oopSidewaysReturn =
      player.positionBeforeDropshot === null && !card.approach &&
      !player.inPosition && card.type === 'return' && !player.wasLobbed;
    if (oopSidewaysReturn) {
      const before = player.position;
      updatePositionAfterOutOfPositionReturn(player);
      log(player.position !== before
        ? `${player.name} смещается: ${formatPosition(player.position)}`
        : `${player.name} остаётся: ${formatPosition(player.position)}`);
    } else if (player.positionBeforeDropshot !== null) {
      applyDropshotPositioning(player, card);
    } else if (!player.inPosition && card.type === 'return' && player.wasLobbed) {
      log(`${player.name} остаётся: ${formatPosition(player.position)}`);
    }

    log(`${player.name} ПРОМАХ <strong>${card.name}</strong> ${cardStat}! | ${posStr}${extras}<br>${rollStr} против ${vsStr} ✗`);
    displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0, 0, false);
    recordTurn(true, 0);

    player.fatigue += v1;
    if (missedOutOfPosition) player.fatigue += v2;

    const playerSide = playerIndex === 0 ? 'p1' : 'p2';
    drawShotLine(player.position, getTargetPosition(player.position, card.type, card, opponent.position), playerSide);

    endPoint(1 - playerIndex);
    render(players, currentPlayer, gameLog);
  }
}

startGame();
