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
  createPlayer('Player 1', 0),
  createPlayer('Player 2', 1)
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

const gameLog = [];
function log(msg) { gameLog.push(msg); }

// ===== ACTIVE DISCARD MECHANIC =====

function markCardForDiscard(playerIndex, cardIndex, checked) {
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
  if (pos === 'BR') return 'Back Right';
  if (pos === 'BL') return 'Back Left';
  return pos;
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
  if (playerIndex !== currentPlayer) {
    log(`Not ${players[playerIndex].name}'s turn!`);
    render(players, currentPlayer, gameLog);
    return;
  }
  const player = players[playerIndex];
  if (player.hand.length >= HAND_SIZE) {
    log(`${player.name} already has ${HAND_SIZE} cards!`);
    render(players, currentPlayer, gameLog);
    return;
  }

  drawCard(player, log);
  log(`${player.name} draws a card`);
  markedCardIndices[playerIndex] = -1; // drawing clears any active mark

  if (isTrulyStuck(player)) {
    log(`${player.name} has a full hand with no playable cards — point lost!`);
    endPoint(1 - playerIndex);
    render(players, currentPlayer, gameLog);
    return;
  }

  render(players, currentPlayer, gameLog);
}

function discardForPosition(playerIndex, cardIndex, newPosition) {
  if (canDiscardForPosition !== playerIndex) {
    log(`${players[playerIndex].name} cannot discard right now!`);
    render(players, currentPlayer, gameLog);
    return;
  }
  const player = players[playerIndex];
  if (player.position === newPosition) {
    log(`${player.name} is already at ${newPosition}!`);
    render(players, currentPlayer, gameLog);
    return;
  }

  const card = player.hand.splice(cardIndex, 1)[0];
  player.discard.push(card);
  player.position = newPosition;
  player.inPosition = true;

  const { v2 } = getFatigueIncrements();
  if (v2 > 0) player.fatigue += v2;

  log(`${player.name} discards ${card.name} to move to ${formatPosition(newPosition)}`);
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

  log(`--- New Point | Score: ${formatTennisScore()} | Games: ${gamesWon[0]}-${gamesWon[1]} | Server: ${server.name} | Start: ${startPos} ---`);

  if (isTrulyStuck(players[currentPlayer])) {
    log(`${players[currentPlayer].name} has no playable cards at serve — point forfeited.`);
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
    log(`<strong>🎾 ${players[winner].name} WINS THE GAME! Games: ${gamesWon[0]}-${gamesWon[1]}</strong>`);
    tennisP1Points = 0;
    tennisP2Points = 0;
    pointCount = 0;
    servingPlayer = 1 - servingPlayer;
    // Reshuffle both decks at the start of each new game (serve switch)
    players.forEach(p => {
      p.discard.push(...p.hand, ...p.temporaryRemovedServes);
      p.hand = [];
      p.temporaryRemovedServes = [];
      p.deck = shuffle([...p.deck, ...p.discard]);
      p.discard = [];
    });
  } else {
    log(`<strong>Point → ${players[winnerIndex].name}! Score: ${formatTennisScore()}</strong>`);
  }

  startNewPoint();
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
  // Shuffle once at game start — decks persist across points from here
  players.forEach((p, idx) => {
    p.deck    = shuffle([...PLAYER_DECKS[idx]]);
    p.discard = [];
    p.hand    = [];
    p.temporaryRemovedServes = [];
  });
  log('=== 🎾 Tennis Card Game Start ===');
  startNewPoint();
  render(players, currentPlayer, gameLog);
}

// ===== POSITION HELPERS =====

function applyDropshotPositioning(player, card) {
  player.position = 'Net';
  if (card.approach) log(`${player.name} approaches to net`);
  player.positionBeforeDropshot = null;
}

function applyNormalPositioning(player, card) {
  if (card.approach) {
    player.position = 'Net';
    log(`${player.name} moves to the net`);
    return;
  }
  if (!player.inPosition && card.type === 'return') {
    if (player.wasLobbed) {
      log(`${player.name} stays at ${formatPosition(player.position)}`);
    } else {
      updatePositionAfterOutOfPositionReturn(player);
      log(`${player.name} moves to ${formatPosition(player.position)}`);
    }
  }
  if (player.inPosition && player.wasLobbed) player.wasLobbed = false;
}

function calcOpponentOutOfPosition(card, player, opponent) {
  const dir = getShotDirection(card);
  let oop = willOpponentBeOutOfPosition(player.position, opponent.position, dir);
  if (card.targetOpposite) {
    oop = opponent.position !== 'Net'; // always wrong corner unless at net
  } else if (card.target) {
    oop = opponent.position !== card.target;
  }
  if (!card.targetOpposite && opponent.position === 'Net' && dir !== 'neutral') oop = false;
  if (card.volley && opponent.position === 'Net')    oop = false;
  if (card.antiNet && opponent.position === 'Net') {
    oop = true;
    log(`${card.name} forces net player out of position!`);
  }
  if (card.dropshot && opponent.position !== 'Net')  oop = true;
  return oop;
}

// ===== MAIN PLAY ACTION =====

function playCard(playerIndex, cardIndex) {
  const player   = players[playerIndex];
  const opponent = players[1 - playerIndex];
  const card     = player.hand[cardIndex];

  // Pre-play state: track dropshot response origin
  const respondingToDropshot = incomingCard && incomingCard.dropshot && player.position !== 'Net';
  if (respondingToDropshot) player.positionBeforeDropshot = player.position;

  // Validate
  if (!isCardPlayable(card, player, incomingPower, incomingCard)) {
    if (card.type === 'serve' && incomingPower > 0) {
      log(`${player.name} cannot serve mid-rally!`);
    } else if (incomingPower === 0 && card.type !== 'serve') {
      log(`${player.name} must serve first!`);
    } else if (player.position === 'Net' && !card.volley && !card.overhead && !respondingToDropshot) {
      log(`${player.name} cannot play ${card.name} at the net!`);
    } else if (card.volley && player.position !== 'Net') {
      log(`${player.name} cannot play ${card.name} — volleys only at net!`);
    } else if (card.overhead && (!incomingCard || !incomingCard.smashable)) {
      log(`${player.name} cannot smash — only moonballs and lobs!`);
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

    const effectDesc = color === 'red'  ? '+2 Power to shot' :
                       color === 'blue' ? '+1 Spin to shot'  : 'Free draw after shot';
    log(`${player.name} discards <strong>${activeCard.name}</strong> for effect: ${effectDesc}`);
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
  const posStr  = `${player.inPosition ? 'IN' : 'OUT'} pos (${info.numDice}d6)`;
  const rollStr = `Roll ${info.diceRoll} - Fat ${info.fatigue}${info.d3Value > 0 ? ` - d3 ${info.d3Value}` : ''} = <strong>${info.skillCheck}</strong>`;
  const extras  = `${info.d3Value > 0 ? ` | Complex: -${info.d3Value}` : ''}${info.guidedPenalty > 0 ? ` | Guided: +${info.guidedPenalty}` : ''}`;

  if (success) {
    // Pre-roll powershot bonus BEFORE display so the red die shows immediately
    if (card.powershot) {
      pendingPowershotBonus = Math.floor(Math.random() * 6) + 1;
    }

    displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0, pendingPowershotBonus);

    log(`${player.name} plays <strong>${card.name}</strong> | ${posStr}${extras}<br>${rollStr} vs ${info.totalComplexity} ✓${pendingPowershotBonus > 0 ? ` | ⚡ Opponent +${pendingPowershotBonus}` : ''}`);

    player.fatigue += v1;
    if (!player.inPosition) player.fatigue += v2;
    if (card.type === 'serve') serveAttempt = 1;

    // Positioning
    if (player.positionBeforeDropshot !== null) {
      applyDropshotPositioning(player, card);
    } else {
      applyNormalPositioning(player, card);
    }

    // Shot trajectory
    const playerSide = playerIndex === 0 ? 'p1' : 'p2';
    drawShotLine(player.position, getTargetPosition(player.position, card.type, card, opponent.position), playerSide);

    // Opponent positioning
    opponent.inPosition = !calcOpponentOutOfPosition(card, player, opponent);

    // Lob: immediately push net opponent to back position so they can answer correctly
    if (card.antiNet && card.smashable && opponent.position === 'Net') {
      opponent.position = player.position;
      opponent.inPosition = false;
      opponent.wasLobbed = true;
      log(`${opponent.name} is lobbed back to ${formatPosition(player.position)} (out of position)`);
    }

    // Update current-turn info for the panel
    lastTurnInfo = {
      playerIndex,
      cardName:       card.name,
      power:          shotPower,
      spin:           shotSpin,
      direction:      card.direction || 'neutral',
      baseDifficulty: shotPower + shotSpin,
      powershotBonus: pendingPowershotBonus,
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
    };

    incomingPower = shotPower;
    incomingSpin  = shotSpin;
    incomingCard  = card;
    canDiscardForPosition = playerIndex;
    currentPlayer = 1 - currentPlayer;

    // Green discard free draw — must fire BEFORE isTrulyStuck/endPoint
    // so the draw lands in the current hand, not after startNewPoint resets it to 5
    if (pendingGreenDraw) {
      drawCard(player, log, true); // skipFatigue = true
      log(`${player.name} draws a free card (green discard effect)`);
    }

    if (isTrulyStuck(players[currentPlayer])) {
      log(`${players[currentPlayer].name} has a full hand with no playable cards — point lost!`);
      endPoint(1 - currentPlayer);
    }

    render(players, currentPlayer, gameLog);

  } else {
    // Serve fault
    if (card.type === 'serve') {
      if (serveAttempt === 1) {
        log(`${player.name} — FAULT! Second serve.`);
        displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0);
        serveAttempt = 2;
        if (pendingGreenDraw) {
          drawCard(player, log, true);
          log(`${player.name} draws a free card (green discard effect)`);
        }
        render(players, currentPlayer, gameLog);
      } else {
        log(`${player.name} — DOUBLE FAULT! Point to ${players[1 - playerIndex].name}.`);
        displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0);
        endPoint(1 - playerIndex);
        render(players, currentPlayer, gameLog);
      }
      return;
    }

    // Normal miss
    log(`${player.name} MISSES <strong>${card.name}</strong>! | ${posStr}${extras}<br>${rollStr} vs ${info.totalComplexity} ✗`);
    displayDiceRoll(playerIndex, info.diceValues, info.diceRoll, info.fatigue, info.skillCheck, info.d3Value || 0);

    player.fatigue += v1;
    if (!player.inPosition) player.fatigue += v2;

    if (player.positionBeforeDropshot !== null) {
      applyDropshotPositioning(player, card);
    } else {
      if (!player.inPosition && card.type === 'return') {
        if (player.wasLobbed) {
          log(`${player.name} stays at ${formatPosition(player.position)}`);
        } else {
          updatePositionAfterOutOfPositionReturn(player);
          log(`${player.name} moves to ${formatPosition(player.position)}`);
        }
      }
    }

    const playerSide = playerIndex === 0 ? 'p1' : 'p2';
    drawShotLine(player.position, getTargetPosition(player.position, card.type, card, opponent.position), playerSide);

    endPoint(1 - playerIndex);
    render(players, currentPlayer, gameLog);
  }
}

startGame();
