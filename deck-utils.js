// ===== DECK UTILITIES =====

/**
 * Fisher-Yates shuffle — mutates and returns the array.
 */
function shuffle(array) {
  if (!Array.isArray(array)) {
    console.error('shuffle() called with non-array:', array);
    return [];
  }
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Draw one card from the player's deck into their hand.
 * If the deck is empty it's rebuilt from the discard pile.
 * @param {boolean} skipFatigue - pass true for free draws (start of point)
 */
function drawCard(player, logFunction, skipFatigue = false) {
  if (player.deck.length === 0) {
    if (player.discard.length === 0) {
      logFunction(`${player.name} has no cards left!`);
      return;
    }
    player.deck = shuffle([...player.discard]);
    player.discard = [];
    logFunction(`${player.name} reshuffles their discard pile.`);
  }

  player.hand.push(player.deck.pop());

  if (!skipFatigue) {
    const increments = getFatigueIncrements();
    if (increments.v2 > 0) player.fatigue += increments.v2;
  }
}
