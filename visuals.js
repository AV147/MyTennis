// ===== VISUAL UTILITIES =====

let currentShotLine = null;

function drawShotLine(fromPosition, toPosition, playerSide) {
  if (currentShotLine) { currentShotLine.remove(); currentShotLine = null; }

  const court = document.getElementById('court');
  if (!court) return;

  const fromZone = document.querySelector(`[data-id="${playerSide}-${fromPosition}"]`);
  if (!fromZone) return;

  const courtRect = court.getBoundingClientRect();
  const fromRect  = fromZone.getBoundingClientRect();
  const fromX = fromRect.left + fromRect.width  / 2 - courtRect.left;
  const fromY = fromRect.top  + fromRect.height / 2 - courtRect.top;

  let toX, toY;

  if (toPosition === 'MIDDLE') {
    const opp = playerSide === 'p1' ? 'p2' : 'p1';
    const blRect = document.querySelector(`[data-id="${opp}-BL"]`).getBoundingClientRect();
    const brRect = document.querySelector(`[data-id="${opp}-BR"]`).getBoundingClientRect();
    toX = (blRect.left + blRect.width / 2 + brRect.left + brRect.width / 2) / 2 - courtRect.left;
    toY = (blRect.top  + blRect.height / 2 + brRect.top  + brRect.height / 2) / 2 - courtRect.top;
  } else {
    const opp    = playerSide === 'p1' ? 'p2' : 'p1';
    const toZone = document.querySelector(`[data-id="${opp}-${toPosition}"]`);
    if (!toZone) return;
    const toRect = toZone.getBoundingClientRect();
    toX = toRect.left + toRect.width  / 2 - courtRect.left;
    toY = toRect.top  + toRect.height / 2 - courtRect.top;
  }

  const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', fromX); line.setAttribute('y1', fromY);
  line.setAttribute('x2', toX);   line.setAttribute('y2', toY);
  line.setAttribute('stroke', '#FFD700');
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-dasharray', '8,4');
  line.setAttribute('stroke-linecap', 'round');

  svg.appendChild(line);
  court.appendChild(svg);
  currentShotLine = svg;
}

/**
 * Render player tokens on the court.
 * @param {number} currentPlayerIndex - whose turn it is (token shifts toward net for neutral shots)
 * @param {boolean} neutralIncoming   - true when the last shot was neutral direction
 */
function renderCourtPositions(players, currentPlayerIndex = -1, shiftToCenter = false) {
  document.querySelectorAll('.player-token').forEach(el => el.remove());

  players.forEach((player, idx) => {
    const prefix = idx === 0 ? 'p1' : 'p2';
    const zone   = document.querySelector(`[data-id="${prefix}-${player.position}"]`);
    if (!zone) return;

    const token = document.createElement('div');
    token.className = `player-token token-p${idx + 1}`;
    token.innerText = `P${idx + 1}`;

    // P1: BR at bottom (top:75%) shifts up→22%, BL at top (top:25%) shifts down→78%
    // P2: BR at top (top:25%) shifts down→78%, BL at bottom (top:75%) shifts up→22%
    if (shiftToCenter && idx === currentPlayerIndex) {
      if (idx === 0) {
        if (player.position === 'BR') token.style.top = '22%';
        else if (player.position === 'BL') token.style.top = '78%';
      } else {
        if (player.position === 'BR') token.style.top = '78%';
        else if (player.position === 'BL') token.style.top = '22%';
      }
    }

    zone.appendChild(token);
  });
}
