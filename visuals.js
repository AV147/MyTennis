// ===== VISUAL UTILITIES =====

let currentShotLine = null;
let currentShotBall = null;

// How long the ball takes to fly along the trajectory. The line "draws" itself
// over the same time instead of appearing instantly. Tunable.
let BALL_FLIGHT_MS = 3000;

// Inject the shot-line/ball keyframes once (shared by index.html + old_index).
function ensureShotStyles() {
  if (typeof document === 'undefined' || document.getElementById('shot-anim-styles')) return;
  const s = document.createElement('style');
  s.id = 'shot-anim-styles';
  s.textContent = `
    @keyframes shot-line-draw { to { stroke-dashoffset: 0; } }
    @keyframes shot-ball-fly {
      from { transform: translate(var(--bx0), var(--by0)); }
      to   { transform: translate(var(--bx1), var(--by1)); }
    }
    .shot-ball {
      position: absolute; top: 0; left: 0; width: 12px; height: 12px;
      border-radius: 50%; z-index: 6; pointer-events: none; will-change: transform;
      background: radial-gradient(circle at 35% 30%, #fffbe0, #ffd000 60%, #e0a800);
      box-shadow: 0 0 7px rgba(255,215,0,.85), 0 1px 2px rgba(0,0,0,.4);
    }`;
  document.head.appendChild(s);
}

// Remove the current trajectory (line + ball). Called before each new shot and
// when a point/match resets.
function clearShotLine() {
  if (currentShotLine) { currentShotLine.remove(); currentShotLine = null; }
  if (currentShotBall) { currentShotBall.remove(); currentShotBall = null; }
}

function drawShotLine(fromPosition, toPosition, playerSide) {
  clearShotLine();
  ensureShotStyles();

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

  const dur = (BALL_FLIGHT_MS / 1000) + 's';
  const len = Math.hypot(toX - fromX, toY - fromY);

  const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', fromX); line.setAttribute('y1', fromY);
  line.setAttribute('x2', toX);   line.setAttribute('y2', toY);
  line.setAttribute('stroke', '#FFD700');
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-linecap', 'round');
  // Draw the line progressively: one dash the full length, offset animated to 0.
  line.setAttribute('stroke-dasharray', len);
  line.setAttribute('stroke-dashoffset', len);
  line.style.animation = `shot-line-draw ${dur} linear forwards`;

  svg.appendChild(line);
  court.appendChild(svg);
  currentShotLine = svg;

  // Ball rides the leading edge of the drawing line (HTML div, px transforms).
  const ball = document.createElement('div');
  ball.className = 'shot-ball';
  ball.style.setProperty('--bx0', (fromX - 6) + 'px');
  ball.style.setProperty('--by0', (fromY - 6) + 'px');
  ball.style.setProperty('--bx1', (toX - 6) + 'px');
  ball.style.setProperty('--by1', (toY - 6) + 'px');
  ball.style.transform = `translate(${toX - 6}px, ${toY - 6}px)`; // resting at target after
  ball.style.animation = `shot-ball-fly ${dur} linear forwards`;
  court.appendChild(ball);
  currentShotBall = ball;
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
