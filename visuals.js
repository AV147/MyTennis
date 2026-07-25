// ===== VISUAL UTILITIES =====

let currentShotLine = null;
let currentShotBall = null;

// Ball speed scales linearly with the shot's real power: weakest (2) is slowest,
// strongest (14 = smash +2 discard +6 powershot die) is fastest.
let BALL_DUR_SLOW = 4500;   // ms at power 2
let BALL_DUR_FAST = 500;    // ms at power 14
const POWER_MIN = 2, POWER_MAX = 14;

// Arc height per unit of "curve spin" as a fraction of court height. Tuned so a
// full lob (5) rises above the court into the score bar, while spins 1–3 arc
// within the court. The on-screen clamp in drawShotLine caps the very top.
const CURVE_UNIT_FRAC = 0.24;

const SHOT_COLOR = '#CCFF00';   // tennis-ball yellow

function ballDuration(power) {
  const p = Math.max(POWER_MIN, Math.min(POWER_MAX, power || 5));
  const t = (p - POWER_MIN) / (POWER_MAX - POWER_MIN);   // 0..1
  return BALL_DUR_SLOW + t * (BALL_DUR_FAST - BALL_DUR_SLOW);
}

// Inject shot-line/ball keyframes + sprite styles once (shared by both pages).
function ensureShotStyles() {
  if (typeof document === 'undefined' || document.getElementById('shot-anim-styles')) return;
  const s = document.createElement('style');
  s.id = 'shot-anim-styles';
  s.textContent = `
    @keyframes shot-line-draw { to { stroke-dashoffset: 0; } }
    @keyframes shot-ball-move { from { offset-distance: 0%; } to { offset-distance: 100%; } }
    .shot-ball {
      position: fixed; top: 0; left: 0; width: 12px; height: 12px; border-radius: 50%;
      z-index: 55; pointer-events: none; will-change: offset-distance; offset-rotate: 0deg;
      background: radial-gradient(circle at 35% 30%, #f4ffb8, ${SHOT_COLOR} 60%, #9fce00);
      box-shadow: 0 0 7px rgba(204,255,0,.9), 0 1px 2px rgba(0,0,0,.4);
    }
    .player-token.player-sprite {
      width: auto; height: 46px; border: none; background: none; box-shadow: none;
      border-radius: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55));
    }`;
  document.head.appendChild(s);
}

// Remove the current trajectory (line + ball). Called before each new shot and
// when a point/match resets.
function clearShotLine() {
  if (currentShotLine) { currentShotLine.remove(); currentShotLine = null; }
  if (currentShotBall) { currentShotBall.remove(); currentShotBall = null; }
}

// Centre of a court zone in viewport coordinates.
function zoneCenter(id) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Draw an arced shot trajectory with a ball flying along it.
 * @param {number} curveSpin - 0 straight … 3 (blue discard), 4 half-lob, 5 lob
 * @param {number} power     - effective power (drives flight speed)
 * The overlay is viewport-fixed so a high lob can arc up into the score bar
 * without being clipped by the court's overflow:hidden.
 */
function drawShotLine(fromPosition, toPosition, playerSide, curveSpin = 0, power = 5) {
  clearShotLine();
  ensureShotStyles();

  const court = document.getElementById('court');
  if (!court) return;

  const from = zoneCenter(`${playerSide}-${fromPosition}`);
  if (!from) return;

  const opp = playerSide === 'p1' ? 'p2' : 'p1';
  let to;
  if (toPosition === 'MIDDLE') {
    const bl = zoneCenter(`${opp}-BL`), br = zoneCenter(`${opp}-BR`);
    if (!bl || !br) return;
    to = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
  } else {
    to = zoneCenter(`${opp}-${toPosition}`);
    if (!to) return;
  }

  const H = court.getBoundingClientRect().height;
  const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
  const arc  = curveSpin * H * CURVE_UNIT_FRAC;   // upward (toward top of screen)
  let cx = midX, cy = midY - arc;
  // Keep the top of the arc on-screen: it may rise above the court into the
  // score bar, but the peak stays at y >= 2px.
  const minPeak = 2;
  if ((midY + cy) / 2 < minPeak) cy = 2 * minPeak - midY;

  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  const dur = (ballDuration(power) / 1000) + 's';

  // Line — viewport-fixed SVG, overflow visible so the arc isn't clipped.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:54;overflow:visible;';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', SHOT_COLOR);
  path.setAttribute('stroke-width', '3');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  document.body.appendChild(svg);
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.style.animation = `shot-line-draw ${dur} linear forwards`;
  currentShotLine = svg;

  // Ball — rides the same path via CSS offset-path.
  const ball = document.createElement('div');
  ball.className = 'shot-ball';
  ball.style.offsetPath = `path('${d}')`;
  ball.style.animation = `shot-ball-move ${dur} linear forwards`;
  document.body.appendChild(ball);
  currentShotBall = ball;
}

/**
 * Render player sprites on the court.
 * Sprite gender reflects difficulty (variant A): the AI (P2) is female on Hard
 * (v3) / male on Easy (v2); the human (P1) is the opposite, so the court always
 * shows one male + one female.
 * @param {boolean} shiftToCenter - true when the last shot was neutral direction
 */
function renderCourtPositions(players, currentPlayerIndex = -1, shiftToCenter = false) {
  ensureShotStyles();
  document.querySelectorAll('.player-token').forEach(el => el.remove());

  const aiVer = (typeof aiVersion !== 'undefined' && aiVersion) ? aiVersion[1] : 2;
  const aiIsFem = aiVer === 3;   // Hard AI = female

  players.forEach((player, idx) => {
    const prefix = idx === 0 ? 'p1' : 'p2';
    const zone   = document.querySelector(`[data-id="${prefix}-${player.position}"]`);
    if (!zone) return;

    // P2 (AI) matches difficulty; P1 (human) is the opposite gender.
    const gender = idx === 1 ? (aiIsFem ? 'fem' : 'male') : (aiIsFem ? 'male' : 'fem');
    const img = document.createElement('img');
    img.className = 'player-token player-sprite';
    img.src = `${prefix}-${gender}.png`;
    img.alt = `P${idx + 1}`;

    // P1: BR at bottom (top:75%) shifts up→22%, BL at top (top:25%) shifts down→78%
    // P2: BR at top (top:25%) shifts down→78%, BL at bottom (top:75%) shifts up→22%
    if (shiftToCenter && idx === currentPlayerIndex) {
      if (idx === 0) {
        if (player.position === 'BR') img.style.top = '22%';
        else if (player.position === 'BL') img.style.top = '78%';
      } else {
        if (player.position === 'BR') img.style.top = '78%';
        else if (player.position === 'BL') img.style.top = '22%';
      }
    }

    zone.appendChild(img);
  });
}
