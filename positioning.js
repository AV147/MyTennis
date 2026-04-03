// ===== POSITIONING UTILITIES =====

/**
 * Get the shot direction from a card ('line', 'cross', or 'neutral').
 */
function getShotDirection(card) {
  return card.direction || 'neutral';
}

/**
 * Returns true if the opponent will be out of position after this shot.
 */
function willOpponentBeOutOfPosition(shooterPosition, opponentPosition, shotDirection) {
  if (shotDirection === 'line')  return shooterPosition === opponentPosition;
  if (shotDirection === 'cross') return shooterPosition !== opponentPosition;
  return false; // neutral shots have no positioning effect
}

/**
 * Get the court zone the shot is aimed at on the opponent's side.
 * @param {string} shooterPosition - shooter's current zone
 * @param {string} cardType        - 'serve' or 'return'
 * @param {Object} card            - the card being played
 * @param {string} opponentPosition - opponent's current zone (needed for targetOpposite)
 * @returns {string} 'BL' | 'BR' | 'Net' | 'MIDDLE'
 */
function getTargetPosition(shooterPosition, cardType, card = null, opponentPosition = null) {
  if (card && card.dropshot) return 'Net';

  // Dynamic targeting: aim at the corner opposite to where opponent stands
  if (card && card.targetOpposite) {
    if (opponentPosition === 'BR') return 'BL';
    if (opponentPosition === 'BL') return 'BR';
    return 'MIDDLE'; // opponent at Net → fall back to neutral
  }

  if (card && card.target)   return card.target; // volley targets a specific corner

  if (cardType === 'serve') return shooterPosition; // serves go cross-court (same zone, opposite side)

  const dir = card ? getShotDirection(card) : 'neutral';
  if (dir === 'cross') return shooterPosition;                              // diagonal
  if (dir === 'line')  return shooterPosition === 'BR' ? 'BL' : 'BR';     // down the line
  return 'MIDDLE';                                                          // neutral
}

/**
 * When a player returns while out of position they move to the opposite back corner.
 */
function updatePositionAfterOutOfPositionReturn(player) {
  if (player.position === 'BR') player.position = 'BL';
  else if (player.position === 'BL') player.position = 'BR';
}
