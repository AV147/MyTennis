// ===== PLAYER INITIALIZATION =====

/**
 * Create a player object.
 * @param {string} name
 * @param {number} playerIndex - 0 or 1, selects which deck to use
 * @returns {Object} player
 */
function createPlayer(name, playerIndex) {
  return {
    name,
    fatigue: STARTING_VALUES.fatigue,
    deck: [...PLAYER_DECKS[playerIndex]],
    discard: [],
    hand: [],
    position: STARTING_VALUES.position,
    inPosition: STARTING_VALUES.inPosition,
    positionBeforeDropshot: null,
    wasLobbed: false,
    temporaryRemovedServes: []
  };
}
