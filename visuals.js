// ===== VISUAL UTILITIES =====

let currentShotLine = null;
let currentShotBall = null;

// Ball speed scales linearly with the shot's real power: weakest (2) is slowest,
// strongest (14 = smash +2 discard +6 powershot die) is fastest.
let BALL_DUR_SLOW = 4000;   // ms at power 2 (slowest/weakest shot)
let BALL_DUR_FAST = 500;    // ms at power 14
const POWER_MIN = 2, POWER_MAX = 14;

// Arc height per unit of "curve spin", as a fraction of the shot's LENGTH (not
// the court): curvature then looks the same for a given spin regardless of shot
// distance — short net exchanges stay flat, cross-court shots keep their arc.
// A full lob (5) across the court rises into the score bar; the on-screen clamp
// in drawShotLine caps the very top.
const CURVE_SPAN_FRAC = 0.15;

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
      position: absolute; top: 0; left: 0; width: 12px; height: 12px; border-radius: 50%;
      z-index: 26; pointer-events: none; will-change: offset-distance; offset-rotate: 0deg;
      background: radial-gradient(circle at 35% 30%, #f4ffb8, ${SHOT_COLOR} 60%, #9fce00);
      box-shadow: 0 0 7px rgba(204,255,0,.9), 0 1px 2px rgba(0,0,0,.4);
    }
    .player-token.player-sprite {
      width: auto; height: 52px; border: none; background: none; box-shadow: none;
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

/**
 * Where a shot leaves the player. Normally the middle of their zone, but a
 * serve is struck above the head — starting it at the player's centre makes
 * the ball look like it comes out of their chest. Reads the sprite's own box
 * so it follows whatever pose is on screen.
 */
function shotOrigin(id, courtRect, fromTop) {
  const c = zoneCenter(id, courtRect);
  if (!c || !fromTop) return c;
  const sprite = document.querySelector(`[data-id="${id}"] .player-sprite`);
  if (sprite) {
    const r = sprite.getBoundingClientRect();
    // Sprites are bottom-aligned in a common canvas, so the raised racket and
    // the tossed ball sit in the top tenth of the box.
    if (r.height) return { x: c.x, y: r.top - courtRect.top + r.height * 0.12 };
  }
  return { x: c.x, y: c.y - 22 };   // no sprite (headless/tests): top of a 52px box
}

// Centre of a court zone, in coordinates relative to the court (so the shot
// layer lives inside #court and scrolls with it instead of drifting).
function zoneCenter(id, courtRect) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - courtRect.left, y: r.top + r.height / 2 - courtRect.top };
}

/**
 * Draw an arced shot trajectory with a ball flying along it.
 * @param {number} curveSpin - 0 straight … 3 (blue discard), 4 half-lob, 5 lob
 * @param {number} power     - effective power (drives flight speed)
 * The layer lives inside #court (court-relative coords) so it scrolls with the
 * court; #court has overflow:visible so a high lob still arcs into the score bar.
 */
function drawShotLine(fromPosition, toPosition, playerSide, curveSpin = 0, power = 5, fromTop = false) {
  clearShotLine();
  ensureShotStyles();

  const court = document.getElementById('court');
  if (!court) return;
  const courtRect = court.getBoundingClientRect();

  const from = shotOrigin(`${playerSide}-${fromPosition}`, courtRect, fromTop);
  if (!from) return;

  const opp = playerSide === 'p1' ? 'p2' : 'p1';
  let to;
  if (toPosition === 'MIDDLE') {
    const bl = zoneCenter(`${opp}-BL`, courtRect), br = zoneCenter(`${opp}-BR`, courtRect);
    if (!bl || !br) return;
    to = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
  } else {
    to = zoneCenter(`${opp}-${toPosition}`, courtRect);
    if (!to) return;
  }

  const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
  const chord = Math.hypot(to.x - from.x, to.y - from.y);   // shot length
  const arc  = curveSpin * chord * CURVE_SPAN_FRAC;          // upward (toward top of screen)
  let cx = midX, cy = midY - arc;
  // Keep the top of the arc on-screen: it may rise above the court (coords are
  // court-relative) into the score bar, but its peak stays at viewport y >= 2px.
  const minPeak = 2 - courtRect.top;   // court-relative y mapping to viewport y=2
  if ((midY + cy) / 2 < minPeak) cy = 2 * minPeak - midY;

  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  const dur = (ballDuration(power) / 1000) + 's';

  // Line — SVG inside #court (overflow:visible keeps the arc unclipped).
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:25;overflow:visible;';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', SHOT_COLOR);
  path.setAttribute('stroke-width', '3');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  court.appendChild(svg);
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
  court.appendChild(ball);
  currentShotBall = ball;
}

/**
 * Render player sprites on the court.
 * Sprite gender reflects difficulty (variant A): the AI (P2) is female on Hard
 * (v3) / male on Easy (v2); the human (P1) is the opposite, so the court always
 * shows one male + one female.
 * @param {boolean} shiftToCenter - true when the last shot was neutral direction
 */
// Poses each sprite comes in: neutral, serving, and crouched at the net.
const SPRITE_STANCES = ['', '-serve', '-net'];
let spritesPreloaded = false;

/** Warm the browser cache so swapping pose mid-rally doesn't flash. */
function preloadSprites() {
  if (spritesPreloaded || typeof Image === 'undefined') return;
  spritesPreloaded = true;
  for (const p of ['p1', 'p2'])
    for (const g of ['fem', 'male'])
      for (const st of SPRITE_STANCES) { const i = new Image(); i.src = `${p}-${g}${st}.png`; }
}

/**
 * Which pose a player is drawn in. Standing at the net wins over serving (you
 * cannot serve from there), and the serve pose holds across both attempts —
 * until the serve lands and the rally proper begins (incomingPower > 0).
 */
function spriteStance(player, idx) {
  if (player.position === 'Net') return '-net';
  const isServer    = typeof servingPlayer !== 'undefined' && idx === servingPlayer;
  const beforeRally = typeof incomingPower === 'undefined' || incomingPower === 0;
  return (isServer && beforeRally) ? '-serve' : '';
}

function renderCourtPositions(players, currentPlayerIndex = -1, shiftToCenter = false) {
  ensureShotStyles();
  preloadSprites();
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
    img.src = `${prefix}-${gender}${spriteStance(player, idx)}.png`;
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
