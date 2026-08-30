// ===== SCRIPTED TUTORIAL (index.html only) =================================
// Four points played on the real board, start to finish. Nothing is faked:
// the player presses the real buttons, game.js resolves the shots and the
// score really runs 15:0 → 30:0 → 40:0 → game. What IS scripted is the
// randomness —
// hands are dealt from a fixed list, every die is forced, and the opponent
// plays a predetermined card each turn — so the numbers quoted in a tooltip
// always match what's on screen.
//
// The script is a flat list of beats executed in order:
//   deal     — lay out both hands (instant, invisible)
//   newpoint — press "Новый розыгрыш" for the player, then fall through
//   text     — tooltip + «Далее»
//   play     — wait for the player to play one specific card
//   move     — wait for the player to discard one card to reposition
//   mark     — wait for the player to tick one card for the active discard
//   pass     — wait for the player to press «✓ Передать ход»
//   ai       — the opponent plays its scripted card after the usual delay
//   end      — closing tooltip, hands the match back to the real AI
//
// Every other card/button is locked while a beat is waiting, so the script
// cannot desync: the player can only make the move the tutorial expects.
//
// Started from the main menu via startTutorial(). Restarts the match so the
// human always serves the first point.

/* eslint-disable no-undef */

// ── Script ─────────────────────────────────────────────────────────────────
// Roll notation: { dice: [...], d3: n } — exactly what rollDice() will return
// for that shot. Sums are worked out against the real complexity formula, so
// changing a card's stats means re-checking the roll that answers it.

const TUT_SCRIPT = [

  // ═══ Розыгрыш 1 — подача проходит, соперник ошибается ═══════════════════
  { kind: 'deal',
    p0: ['FlatServe', 'KickServe', 'StrongForehand', 'WeakForehand', 'Slice'],
    p1: ['StrongForehand', 'WeakForehand', 'Slice', 'WeakCrossCourt', 'SliceCrossCourt'] },

  { kind: 'text', numbered: false, shade: 'strong',
    text: '<strong>Добро пожаловать в MyTennis!</strong><br>Это карточный теннис: каждый удар — сыгранная карта и бросок кубиков. Сейчас вы сами разыграете четыре очка и выиграете гейм, а я буду объяснять механику по ходу дела.',
    nextLabel: 'Начать' },

  { kind: 'play', card: 'FlatServe', roll: { dice: [3, 3] },
    text: 'Ваша подача. Нажмите «▶ Играть» на карте <strong>Плоская подача</strong> — попадёте вы или нет, решит бросок кубиков.',
    hint: '👆 «▶ Играть» на плоской подаче' },

  { kind: 'text', target: '#app-turn-section',
    text: 'Подача прошла. Сложность вашей карты — это её <strong>Сила − Спин</strong>: 10 − 0 = 10, плюс 1 за метку <strong>Прицельный</strong> — итого <strong>11</strong>. Бросок кубиков считается как 6 + 3 + 3 = <strong>12</strong>. 12 ≥ 11 — мяч в корте.' },

  { kind: 'pass', target: '#player1 .ai-btn-pass',
    text: 'Ход уходит не сразу: после удара вам дают окно, чтобы перебежать в другую зону. Сейчас перебегать незачем — нажмите «<strong>✓ Передать ход</strong>».<br>А если вы всё-таки перебежите, ход передастся сам, отдельно нажимать не придётся.',
    hint: '👆 «✓ Передать ход»' },

  { kind: 'ai', card: 'StrongForehand', roll: { dice: [2, 3] } },

  { kind: 'text', target: '#app-turn-section',
    text: 'Соперник ошибся и проиграл розыгрыш. Для него сложность сложилась из его собственной карты (Сила − Спин: 6 − 2 = <strong>4</strong>) и вашей подачи (Сила + Спин: 10 + 0 = <strong>10</strong>) — итого <strong>14</strong>. Его бросок: 6 + 2 + 3 = <strong>11</strong>. 11 < 14 — мимо.' },

  { kind: 'text', target: '#tennis-score',
    text: '<strong>Счёт 15 : 0.</strong> Счёт ведётся по теннисным правилам: 0 – 15 – 30 – 40 – гейм. При 40 : 40 играется «больше-меньше» — до преимущества в два розыгрыша.',
    nextLabel: 'Следующий розыгрыш ›' },

  // ═══ Розыгрыш 2 — вторая подача, вне позиции ════════════════════════════
  { kind: 'newpoint' },
  { kind: 'deal',
    p0: ['FlatServe', 'KickServe', 'WeakCrossCourt', 'Slice', 'WeakForehand'],
    p1: ['SliceDownTheLine', 'StrikeDownTheLine', 'WeakForehand', 'Slice', 'Moonball'] },

  { kind: 'play', card: 'FlatServe', roll: { dice: [1, 2] },
    text: 'Подавайте снова. Первой подачей выгодно рискнуть и выбрать самую сильную: в запасе всегда есть вторая попытка.',
    hint: '👆 «▶ Играть» на плоской подаче' },

  { kind: 'text', target: '#app-turn-section',
    text: 'Не хватило: бросок 6 + 1 + 2 = <strong>9</strong> против сложности <strong>11</strong>. Это ошибка первой подачи — их в теннисе даётся две. Ошибка на обеих означала бы потерянное очко.' },

  { kind: 'play', card: 'KickServe', roll: { dice: [4, 2] },
    text: 'Вторую подачу берут надёжную. У <strong>Крученой подачи</strong> сложность всего 7 − 2 + 1 = <strong>6</strong>: слабее для соперника, зато почти наверняка в корте.',
    hint: '👆 «▶ Играть» на крученой подаче' },

  { kind: 'ai', card: 'SliceDownTheLine', roll: { dice: [4, 3], d3: 1 } },

  { kind: 'text', target: '#player1 .st-pos',
    text: 'Соперник ответил <strong>по линии</strong> — мяч ушёл в тот угол, где вас нет. Вы <strong>вне позиции</strong>: на следующий удар у вас не два кубика, а один. Отбить такой мяч заметно сложнее.' },

  { kind: 'mark', card: 'Slice',
    text: 'Одному кубику надо помочь. Перед ударом можно <strong>сбросить</strong> лишнюю карту ради бонуса — отметьте галочкой <strong>Резаный</strong>. Синие карты дают <strong>+1 к вращению</strong>: вращение вычитается из сложности вашего удара, так что шанс попасть вырастет.',
    hint: '👆 Галочка «🔵 +1 Спин» на «Резаном»' },

  { kind: 'play', card: 'WeakCrossCourt', roll: { dice: [5] },
    text: 'Теперь бейте — <strong>Удар по диагонали</strong> (4 / 2). Вы добежите до мяча и ударите уже из другого угла.',
    hint: '👆 «▶ Играть» на ударе по диагонали' },

  { kind: 'text', target: '#app-court-wrap',
    text: 'Достали: бросок 6 + 5 − 1 усталости = <strong>10</strong> против сложности <strong>6</strong> — сброс срезал с неё единицу. Другие цвета: 🔴 красная даёт <strong>+2 к силе</strong>, 🟢 зелёная — <strong>бесплатный добор</strong> карты.' },

  { kind: 'text', target: '#app-court-wrap',
    text: 'Теперь вне позиции соперник — диагональ увела мяч от него. А вот неприцельные удары, без пометки «по линии» или «по диагонали», соперник всегда отбивает в позиции.' },

  { kind: 'ai', card: 'StrikeDownTheLine', roll: { dice: [3], d3: 2 } },

  { kind: 'text', target: '#player1 .st-fat',
    text: 'Соперник не дотянулся — <strong>счёт 30 : 0</strong>. Заодно посмотрите на усталость: каждый бег вне позиции и каждый добор карты стоят +1, и эта единица вычитается из вашего броска. Между розыгрышами усталость обнуляется.',
    nextLabel: 'Следующий розыгрыш ›' },

  // ═══ Розыгрыш 3 — выход к сетке, удар слёта, свеча и смэш ═══════════════
  { kind: 'newpoint' },
  { kind: 'deal',
    p0: ['FlatServe', 'KickServe', 'VolleyStrike', 'Smash', 'VolleySlice'],
    p1: ['WeakCrossCourt', 'Lob', 'StrongForehand', 'Slice', 'WeakForehand'] },

  { kind: 'play', card: 'FlatServe', roll: { dice: [5, 4] },
    text: 'Снова ваша подача — бейте плоскую.',
    hint: '👆 «▶ Играть» на плоской подаче' },

  { kind: 'move', card: 'KickServe', to: 'Net',
    text: 'После своего удара можно перебежать в любую зону, сбросив за это одну карту (+1 усталости). Сбросьте ненужную теперь <strong>Крученую подачу</strong> и выйдите <strong>к сетке</strong>.',
    hint: '👆 «→ Сетка» на крученой подаче' },

  { kind: 'ai', card: 'WeakCrossCourt', roll: { dice: [5, 4] } },

  { kind: 'text', target: '#app-court-wrap',
    text: 'Соперник отбил по диагонали, но вы у сетки — а <strong>обычные удары не выбивают из позиции того, кто стоит у сетки</strong>. Пользуйтесь этим и атакуйте.' },

  { kind: 'play', card: 'VolleyStrike', roll: { dice: [4, 4] },
    text: 'Сыграйте <strong>Удар слёта</strong>. У сетки играются только <strong>зелёные</strong> карты — остальные заблокированы.',
    hint: '👆 «▶ Играть» на ударе слёта' },

  { kind: 'text', target: '#app-court-wrap',
    text: '<strong>Удар слёта</strong> всегда летит в угол, свободный от соперника: если тот не у сетки, он гарантированно окажется вне позиции.' },

  { kind: 'ai', card: 'Lob', roll: { dice: [6] } },

  { kind: 'text', target: '#app-court-wrap',
    text: 'Соперник достал <strong>Свечку</strong> — это ответ против игрока у сетки: мяч перебрасывает вас, и вы отбегаете назад вне позиции. Но на любую свечу и полусвечку можно ответить <strong>смэшем</strong>: он бьётся <strong>как из позиции</strong> — полные 2 кубика, даже когда вас выбили назад. Он у вас как раз есть.' },

  { kind: 'mark', card: 'VolleySlice',
    text: 'Раз вы уже не у сетки, <strong>Резаный с лёта</strong> отсюда не сыграть — карта мёртвым грузом лежит в руке. Отметьте её: зелёный сброс даёт <strong>бесплатный добор</strong>, и вместо неё придёт карта, которую можно сыграть сзади.',
    hint: '👆 Галочка «🟢 Добор» на резаном с лёта' },

  { kind: 'play', card: 'Smash', roll: { dice: [6, 5] }, powerDie: 5,
    text: 'А теперь отвечайте <strong>Смэшем</strong>.',
    hint: '👆 «▶ Играть» на смэше' },

  { kind: 'text', target: '#app-turn-section',
    text: 'Смэш — сильный удар из-за головы. После попадания бросается <strong>красный кубик</strong>, и его значение (здесь <strong>+5</strong>) добавляется к сложности ответного удара соперника. Зелёная карта тем временем ушла в сброс, а взамен пришла новая.' },

  { kind: 'ai', card: 'StrongForehand', roll: { dice: [3, 4] } },

  { kind: 'text', target: '#tennis-score',
    text: '<strong>Счёт 40 : 0</strong> — до гейма остался один розыгрыш. Разыграем его вместе.',
    nextLabel: 'Следующий розыгрыш ›' },

  // ═══ Розыгрыш 4 — укороченный против выхода к сетке, гейм ════════════════
  { kind: 'newpoint' },
  { kind: 'deal',
    p0: ['FlatServe', 'KickServe', 'ApproachDropShot', 'WeakForehand', 'Slice'],
    p1: ['Dropshot', 'StrikeCrossCourt', 'Slice', 'WeakForehand', 'WeakCrossCourt'] },

  { kind: 'play', card: 'FlatServe', roll: { dice: [4, 4] },
    text: 'Снова подавайте плоскую.',
    hint: '👆 «▶ Играть» на плоской подаче' },

  { kind: 'ai', card: 'Dropshot', roll: { dice: [6, 4], d3: 1 } },

  { kind: 'text', target: '#player1 .st-pos',
    text: 'Соперник сыграл <strong>укороченный</strong>. Такой мяч всегда вытаскивает соперника к сетке: вы <strong>вне позиции</strong> и били бы одним кубиком. Но в руке есть <strong>Выход к сетке с укороченным</strong> — удары с выходом к сетке снимают этот штраф.' },

  { kind: 'play', card: 'ApproachDropShot', roll: { dice: [4, 3], d3: 2 },
    text: 'Сыграйте <strong>Выход к сетке с укороченным</strong>: вы добегаете и бьёте <strong>в позиции</strong>, двумя кубиками, — и сами занимаете сетку.',
    hint: '👆 «▶ Играть» на выходе к сетке с укороченным' },

  { kind: 'text', target: '#app-court-wrap',
    text: 'Вы у сетки и в позиции, а ваш укороченный отправил соперника через весь корт — теперь <strong>вне позиции</strong> он, и кубик у него один.' },

  { kind: 'ai', card: 'StrikeCrossCourt', roll: { dice: [2] } },

  // The closing card is centred and covers the board, so the numbers it used to
  // quote get their own beat first, with the dice still in the spotlight.
  { kind: 'text', target: '#app-turn-section',
    text: 'Соперник не добежал: его бросок 6 + 2 − 1 усталости = <strong>7</strong> против сложности <strong>8</strong>. <strong>Гейм ваш — 1 : 0!</strong>' },

  { kind: 'end', numbered: false, shade: 'strong',
    text: '<strong>Обучение пройдено.</strong><br>Дальше всё по-настоящему: карты и кубики снова случайные, а подавать будет соперник. После каждого очка жмите «🎾 Новый розыгрыш». Удачи!',
    nextLabel: 'Играть!' },
];

// Beats that get a "Шаг N из M" counter
const TUT_NUMBERED = TUT_SCRIPT
  .map((b, i) => ({ b, i }))
  .filter(({ b }) => b.numbered !== false && ['text', 'play', 'move', 'mark', 'pass'].includes(b.kind))
  .map(({ i }) => i);

// ── Pacing ─────────────────────────────────────────────────────────────────
// A shot reads as three separate moments: the dice land, the spotlight moves
// to whatever the next tooltip is about, and only then the ball flies. game.js
// draws the trajectory the instant a card resolves, so during the tutorial the
// call is held (see the drawShotLine wrapper) and released once the ring has
// finished travelling — otherwise the ball crosses the court while the frame
// is still sliding, which just looks smeared.
const TUT_AFTER_PLAY_MS  = 420;   // dice on screen before the spotlight moves
const TUT_AFTER_AI_MS    = 500;
const TUT_AFTER_MOVE_MS  = 400;
const TUT_RING_SETTLE_MS = 330;   // 60 ms of layout + the ring's .25s transition

// ── State ──────────────────────────────────────────────────────────────────
let tutActive  = false;
let tutIndex   = -1;
let tutEls     = null;
let tutTimers  = [];

// Trajectory held back until the spotlight settles. tutPendingShotBeat records
// which beat produced the shot: the release timer belonging to that same beat
// must ignore it, or the ball flies while the ring is still on its way to the
// next target — the very smear this is meant to fix.
let tutOrigDrawShotLine = null;
let tutPendingShot      = null;
let tutPendingShotBeat  = -1;
let tutShotLandsAt      = 0;   // timestamp the ball touches down

// One-shot forced rolls, consumed by the hooks in shot-resolution.js
let tutPendingRoll     = null;
let tutPendingPowerDie = null;

window.__scriptedRoll     = () => { const r = tutPendingRoll;     tutPendingRoll = null;     return r; };
window.__scriptedPowerDie = () => { const d = tutPendingPowerDie; tutPendingPowerDie = null; return d; };

function tutBeat() { return TUT_SCRIPT[tutIndex] || null; }

function tutLater(fn, ms) {
  const h = setTimeout(() => { tutTimers = tutTimers.filter(t => t !== h); if (tutActive) fn(); }, ms);
  tutTimers.push(h);
  return h;
}
function tutClearTimers() { tutTimers.forEach(clearTimeout); tutTimers = []; }

/** How long the held shot will be in the air once released (0 if none). */
function tutShotFlightMs() {
  if (!tutPendingShot || typeof ballDuration !== 'function') return 0;
  return ballDuration(tutPendingShot[4]);   // 5th arg of drawShotLine is power
}

/**
 * When the court will be quiet again — the moment the current ball lands,
 * whether it is still held or already flying. Ball speed scales with power,
 * so this ranges from half a second to four.
 */
function tutBallClearAt() {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (tutPendingShot) return now + TUT_RING_SETTLE_MS + tutShotFlightMs();
  return tutShotLandsAt;
}

/**
 * Release the trajectory game.js wanted to draw when the card resolved.
 * Only fires once the script has moved past the beat that produced the shot,
 * so the ball starts after the spotlight has arrived. `force` is for teardown.
 */
function tutFlushShot(force) {
  if (!tutPendingShot || !tutOrigDrawShotLine) return;
  if (!force && tutIndex === tutPendingShotBeat) return;
  const args = tutPendingShot;
  tutPendingShot = null;
  tutPendingShotBeat = -1;
  tutOrigDrawShotLine(...args);
  tutShotLandsAt = (typeof performance !== 'undefined' ? performance.now() : Date.now())
                 + (typeof ballDuration === 'function' ? ballDuration(args[4]) : 0);
}

// ── Hand stacking ──────────────────────────────────────────────────────────
// startNewPoint() has already dealt a random hand by the time we get here, so
// pool every card the player owns back together and pick out exactly the ones
// this rally needs. Cards are MOVED, never cloned — cloning inflates the deck
// (three deals added 15 phantom cards, six of them serves, and startNewPoint
// hands the server every serve it can find: an 8-card hand of nothing but
// serves once the walkthrough was over).
function tutDeal(playerIndex, keys) {
  const p = players[playerIndex];
  const pool = [...p.hand, ...p.deck, ...p.discard, ...p.temporaryRemovedServes];
  p.hand = []; p.deck = []; p.discard = []; p.temporaryRemovedServes = [];

  for (const k of keys) {
    const name = CARD_LIBRARY[k].name;
    const i = pool.findIndex(c => c.name === name);
    // The deck holds 3 of every card, so the fallback clone is unreachable in
    // practice — it just keeps a hand from ever coming up short.
    p.hand.push(i !== -1 ? pool.splice(i, 1)[0] : CARD_LIBRARY[k].clone());
  }
  p.deck = shuffle(pool);
}

/** Index in the human's hand of the card this beat is about (-1 if gone). */
function tutHandIndex(key) {
  const name = CARD_LIBRARY[key] && CARD_LIBRARY[key].name;
  return name ? players[0].hand.findIndex(c => c.name === name) : -1;
}

// ── Overlay DOM ────────────────────────────────────────────────────────────
function tutEnsureDom() {
  if (tutEls) return;
  const mk = cls => {
    const d = document.createElement('div');
    d.className = cls;
    d.style.display = 'none';
    document.body.appendChild(d);
    return d;
  };
  tutEls = {
    shades: [mk('tut-shade'), mk('tut-shade'), mk('tut-shade'), mk('tut-shade')],
    blocker: mk('tut-hole-blocker'),
    ring: mk('tut-ring'),
    tip: mk('tut-tip'),
  };
}

function tutSetBox(el, left, top, width, height) {
  if (width <= 0 || height <= 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = width + 'px';
  el.style.height = height + 'px';
}

function tutHideShades() {
  tutEls.shades.forEach(s => { s.style.display = 'none'; });
  tutEls.blocker.style.display = 'none';
}

/** The element a beat points at, or null for a centered tooltip. */
function tutTargetEl(beat) {
  if (!beat) return null;
  if (beat.kind === 'play' || beat.kind === 'move' || beat.kind === 'mark') {
    const i = tutHandIndex(beat.card);
    if (i === -1) return null;
    return document.querySelectorAll('#player1 .hand .card')[i] || null;
  }
  return beat.target ? document.querySelector(beat.target) : null;
}

function tutPosition() {
  const beat = tutBeat();
  if (!tutActive || !beat || !tutEls) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const { shades, blocker, ring, tip } = tutEls;
  const el = tutTargetEl(beat);
  const shade = beat.shade || (beat.kind === 'ai' ? 'none' : 'soft');
  const interactive = ['play', 'move', 'mark', 'pass'].includes(beat.kind);

  tip.style.display = 'block';

  if (!el) {
    // Centered card: one full-screen shade (or none), no ring
    if (shade === 'none') tutHideShades();
    else {
      tutSetBox(shades[0], 0, 0, vw, vh);
      shades[0].className = 'tut-shade tut-shade-' + shade;
      shades[1].style.display = shades[2].style.display = shades[3].style.display = 'none';
      blocker.style.display = 'none';
    }
    ring.style.display = 'none';
    tip.style.left = Math.max(8, (vw - tip.offsetWidth) / 2) + 'px';
    tip.style.top = Math.max(8, (vh - tip.offsetHeight) / 2.4) + 'px';
    return;
  }

  const pad = 5;
  const rect = el.getBoundingClientRect();
  const r = {
    left:   Math.max(0, rect.left - pad),
    top:    Math.max(0, rect.top - pad),
    right:  Math.min(vw, rect.right + pad),
    bottom: Math.min(vh, rect.bottom + pad),
  };

  // Narration beats quote what just happened — "соперник ошибся", "12 ≥ 10" —
  // so the played card and the dice have to stay lit and uncovered. Widen the
  // hole to take in the turn section as well; the tooltip then goes below the
  // whole thing, over the hand, which is the one area nothing is said about.
  // Instruction beats (play/move) point at a card down in the hand, so they
  // keep the tight spotlight.
  const keepTurn = beat.keepTurn !== false && (beat.kind === 'text' || beat.kind === 'end');
  const turnEl = keepTurn ? document.querySelector('#app-turn-section') : null;
  if (turnEl) {
    const t = turnEl.getBoundingClientRect();
    if (t.width && t.height) {
      r.left   = Math.max(0,  Math.min(r.left,   t.left - pad));
      r.top    = Math.max(0,  Math.min(r.top,    t.top - pad));
      r.right  = Math.min(vw, Math.max(r.right,  t.right + pad));
      r.bottom = Math.min(vh, Math.max(r.bottom, t.bottom + pad));
    }
  }

  if (shade === 'none') {
    tutHideShades();
  } else {
    shades.forEach(s => { s.className = 'tut-shade tut-shade-' + shade; });
    tutSetBox(shades[0], 0, 0, vw, r.top);                                // top
    tutSetBox(shades[1], 0, r.bottom, vw, vh - r.bottom);                 // bottom
    tutSetBox(shades[2], 0, r.top, r.left, r.bottom - r.top);             // left
    tutSetBox(shades[3], r.right, r.top, vw - r.right, r.bottom - r.top); // right
    // Waiting beats let taps through to the highlighted element; narration
    // beats block the hole too, so nothing can be played out of turn.
    if (interactive) blocker.style.display = 'none';
    else tutSetBox(blocker, r.left, r.top, r.right - r.left, r.bottom - r.top);
  }

  ring.className = 'tut-ring ' + (interactive ? 'tut-ring-act' : 'tut-ring-info');
  tutSetBox(ring, r.left, r.top, r.right - r.left, r.bottom - r.top);

  // Tooltip goes below the hole whenever it fits, above it otherwise — never
  // on top of it. The old "is the hole in the upper half" test broke down once
  // the hole grew to include the turn section.
  const tipW = tip.offsetWidth, tipH = tip.offsetHeight;
  const centerX = (r.left + r.right) / 2;
  tip.style.left = Math.min(Math.max(8, centerX - tipW / 2), vw - tipW - 8) + 'px';
  let top;
  if (r.bottom + 10 + tipH <= vh - 8)      top = r.bottom + 10;   // below
  else if (r.top - 10 - tipH >= 8)         top = r.top - tipH - 10;  // above
  else top = Math.max(8, Math.min(r.bottom + 10, vh - tipH - 8));    // no room: clamp
  tip.style.top = top + 'px';
}

// ── Button locking ─────────────────────────────────────────────────────────
// render() rebuilds #player1 from scratch every time, so the locks are simply
// re-applied afterwards (see the render wrapper at the bottom of the file).
function tutApplyLocks() {
  const beat = tutBeat();
  const panel = document.getElementById('player1');
  if (!beat || !panel) return;

  // Draw and "Новый розыгрыш" are driven by the script, never by the player
  panel.querySelectorAll('.draw-btn').forEach(b => b.remove());
  // "Передать ход" only exists on the beat that teaches it. An ai beat holds
  // the reposition window open to stall the scheduler, which would otherwise
  // flash this button on and off every time the opponent moves.
  if (beat.kind !== 'pass')
    panel.querySelectorAll('.ai-btn-pass').forEach(b => b.remove());

  const wantPlay = beat.kind === 'play' ? tutHandIndex(beat.card) : -1;
  const wantMove = beat.kind === 'move' ? tutHandIndex(beat.card) : -1;
  // Marking any other card would change the power/spin the tooltips quote.
  const wantMark = beat.kind === 'mark' ? tutHandIndex(beat.card) : -1;

  panel.querySelectorAll('.hand .card').forEach((cardEl, idx) => {
    const mark = cardEl.querySelector('.mark-checkbox-row');
    if (mark && idx !== wantMark) mark.remove();

    const playBtn = cardEl.querySelector('.play-btn');
    if (playBtn && idx !== wantPlay) {
      playBtn.disabled = true;
      playBtn.classList.add('play-btn-disabled');
      playBtn.removeAttribute('onclick');
    }
    const move = cardEl.querySelector('.discard-move');
    if (!move) return;
    if (idx !== wantMove) { move.remove(); return; }
    // Keep only the direction the script asked for
    move.querySelectorAll('.position-btn').forEach(b => {
      const oc = b.getAttribute('onclick') || '';
      if (!oc.includes(`'${beat.to}'`)) b.remove();
    });
  });
}

// ── Beat execution ─────────────────────────────────────────────────────────
function tutEnterBeat(i) {
  if (!tutActive) return;
  tutIndex = i;
  const beat = TUT_SCRIPT[i];
  if (!beat) { endTutorial(); return; }

  switch (beat.kind) {

    case 'deal':
      tutDeal(0, beat.p0);
      tutDeal(1, beat.p1);
      render(players, currentPlayer, gameLog);
      tutEnterBeat(i + 1);
      return;

    case 'newpoint':
      tutPendingShot = null; tutPendingShotBeat = -1; tutShotLandsAt = 0;  // confirmNewPoint wipes the board anyway
      if (pendingPointEnd) confirmNewPoint();
      tutEnterBeat(i + 1);
      return;

    case 'ai': {
      // Arm the roll, show "Ход соперника", and let tutRenderTip release the
      // trajectory. The reposition window stays open meanwhile, which is what
      // holds aiCheckAutoTrigger back — only once the ball has actually landed
      // do we clear it, so the opponent never answers a serve in mid-flight
      // (a kick serve is airborne for ~2.5 s; the scheduler's own delay is 0.7).
      tutPendingRoll     = beat.roll || null;
      tutPendingPowerDie = beat.powerDie != null ? beat.powerDie : null;
      // Hold the scheduler shut. A pending reposition window normally does that
      // for us, but discardForPosition clears it and arms the 700 ms timer on
      // its way out — so cancel whatever is armed and re-assert the block.
      if (typeof aiTimeoutHandle !== 'undefined' && aiTimeoutHandle[1]) {
        clearTimeout(aiTimeoutHandle[1]);
        aiTimeoutHandle[1] = null;
      }
      canDiscardForPosition = 0;   // locks are stripped by tutApplyLocks
      const now     = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const clearAt = tutBallClearAt();
      tutRenderTip(beat);
      tutLater(() => {
        canDiscardForPosition = -1;
        render(players, currentPlayer, gameLog);   // arms aiScheduleNext
      }, Math.max(TUT_RING_SETTLE_MS, clearAt - now));
      return;
    }

    case 'play':
    case 'move':
    case 'mark':
      tutPendingRoll     = beat.roll || null;
      tutPendingPowerDie = beat.powerDie != null ? beat.powerDie : null;
      // The card the beat is about must still be in hand, otherwise the script
      // has desynced (shouldn't happen — everything else is locked).
      if (tutHandIndex(beat.card) === -1) { tutBail(); return; }
      tutRenderTip(beat);
      return;

    case 'pass':
      tutRenderTip(beat);
      return;

    default: // 'text' | 'end'
      tutRenderTip(beat);
      return;
  }
}

function tutAdvance(delayMs) {
  const from = tutIndex;
  const go = () => { if (tutActive && tutIndex === from) tutEnterBeat(from + 1); };
  if (delayMs) tutLater(go, delayMs); else go();
}

/** Something went off-script — skip straight to the closing card. */
function tutBail() {
  const last = TUT_SCRIPT.length - 1;
  tutEnterBeat(TUT_SCRIPT[last].kind === 'end' ? last : TUT_SCRIPT.length);
}

function tutRenderTip(beat) {
  tutEnsureDom();
  const tip = tutEls.tip;

  const numIdx = TUT_NUMBERED.indexOf(tutIndex);
  const numHtml = numIdx > -1
    ? `Шаг ${numIdx + 1} из ${TUT_NUMBERED.length}`
    : 'Обучение';

  let actionHtml;
  if (beat.kind === 'ai')
    actionHtml = '<span class="tut-hint tut-hint-wait">🎾 Отвечает соперник…</span>';
  else if (beat.kind === 'text' || beat.kind === 'end')
    actionHtml = `<button class="tut-next">${beat.nextLabel || 'Далее ›'}</button>`;
  else if (beat.kind === 'pass')
    actionHtml = `<span class="tut-hint">${beat.hint || ''}</span>`;
  else
    actionHtml = `<span class="tut-hint">${beat.hint || ''}</span>`;

  tip.innerHTML = `
    <div class="tut-step-num">${numHtml}</div>
    <div class="tut-text">${beat.kind === 'ai' ? 'Ход соперника.' : beat.text}</div>
    <div class="tut-actions">
      <button class="tut-skip">Пропустить</button>
      ${actionHtml}
    </div>`;
  tip.querySelector('.tut-skip').onclick = endTutorial;
  const nextBtn = tip.querySelector('.tut-next');
  if (nextBtn) nextBtn.onclick = () => tutAdvance(0);

  // Re-render so the locks match this beat, then place the spotlight. The card
  // the player must tap may be scrolled out of the horizontal hand strip.
  render(players, currentPlayer, gameLog);
  const el = tutTargetEl(beat);
  if (el && el.closest('.hand') && el.scrollIntoView)
    el.scrollIntoView({ inline: 'center', block: 'nearest' });
  // setTimeout, not rAF — rAF stalls in backgrounded tabs and the tooltip
  // would never appear.
  tutLater(tutPosition, 60);
  // Ball flies once the ring has finished moving, not while it slides.
  tutLater(tutFlushShot, TUT_RING_SETTLE_MS);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
function startTutorial() {
  tutEnsureDom();
  tutClearTimers();
  tutActive = true;
  tutPendingRoll = null;
  tutPendingPowerDie = null;
  tutPendingShot = null;
  tutShotLandsAt = 0;
  document.body.classList.add('tutorial-active');  // re-show in-layout buttons under TG
  startGame();               // fresh match — the human serves the first point
  window.addEventListener('resize', tutPosition);
  tutEnterBeat(0);
}

function endTutorial() {
  tutFlushShot(true);      // don't strand a trajectory that never got drawn
  tutActive = false;
  tutIndex = -1;
  tutClearTimers();
  tutPendingRoll = null;
  tutPendingPowerDie = null;
  document.body.classList.remove('tutorial-active');
  window.removeEventListener('resize', tutPosition);
  if (tutEls) {
    [...tutEls.shades, tutEls.blocker, tutEls.ring, tutEls.tip]
      .forEach(el => { el.style.display = 'none'; });
  }
  // Completing OR skipping both land here — unlock "Играть".
  if (typeof markTutorialSeen === 'function') markTutorialSeen();
  // Rebuild the panel without the tutorial's locks and let the real AI take over.
  if (typeof render === 'function') render(players, currentPlayer, gameLog);
  if (typeof updateMainButton === 'function') updateMainButton();
}

// ── Advancement on real game actions ───────────────────────────────────────
window.__tutorialNotify = function (note, playerIndex) {
  if (!tutActive) return;
  const beat = tutBeat();
  if (!beat) return;

  if (note === 'played' && playerIndex === 0 && beat.kind === 'play') {
    tutAdvance(TUT_AFTER_PLAY_MS);   // dice register, then the spotlight moves
    return;
  }
  if (note === 'played' && playerIndex === 1 && beat.kind === 'ai') {
    tutAdvance(TUT_AFTER_AI_MS);
    return;
  }
  if (note === 'reposition' && playerIndex === 0 && beat.kind === 'move') {
    tutAdvance(TUT_AFTER_MOVE_MS);
    return;
  }
  if (note === 'marked' && playerIndex === 0 && beat.kind === 'mark') {
    tutAdvance(300);   // the tick is instant feedback; don't dawdle
    return;
  }
  if (note === 'passturn' && playerIndex === 0 && beat.kind === 'pass') {
    tutAdvance(TUT_AFTER_MOVE_MS);
    return;
  }
};

// Wrap the game functions the tutorial drives or listens for. Function
// declarations are reassignable globals, and the inline onclick handlers in
// render.js resolve them at call time, so the wrappers apply everywhere.
(function tutHookGameActions() {

  if (typeof render === 'function') {
    const orig = render;
    render = function (...args) {
      orig(...args);
      if (tutActive) tutApplyLocks();
    };
  }

  // Hold the trajectory back while the tutorial is running — tutRenderTip
  // releases it once the spotlight has finished moving.
  if (typeof drawShotLine === 'function') {
    tutOrigDrawShotLine = drawShotLine;
    drawShotLine = function (...args) {
      if (!tutActive) { tutOrigDrawShotLine(...args); return; }
      tutPendingShot = args;
      tutPendingShotBeat = tutIndex;
    };
  }

  if (typeof playCard === 'function') {
    const orig = playCard;
    playCard = function (playerIndex, cardIndex) {
      orig(playerIndex, cardIndex);
      if (window.__tutorialNotify) window.__tutorialNotify('played', playerIndex);
    };
  }

  if (typeof markCardForDiscard === 'function') {
    const orig = markCardForDiscard;
    markCardForDiscard = function (playerIndex, cardIndex, checked) {
      orig(playerIndex, cardIndex, checked);
      // Only ticking on counts — unticking must not advance the script.
      if (checked && window.__tutorialNotify) window.__tutorialNotify('marked', playerIndex);
    };
  }

  if (typeof aiPassTurn === 'function') {
    const orig = aiPassTurn;
    aiPassTurn = function (playerIndex) {
      orig(playerIndex);
      if (window.__tutorialNotify) window.__tutorialNotify('passturn', playerIndex);
    };
  }

  if (typeof discardForPosition === 'function') {
    const orig = discardForPosition;
    discardForPosition = function (playerIndex, cardIndex, newPosition) {
      orig(playerIndex, cardIndex, newPosition);
      if (window.__tutorialNotify) window.__tutorialNotify('reposition', playerIndex);
    };
  }

  // The opponent is scripted during the tutorial: the normal scheduler still
  // provides the delay, but the engine's own decision is bypassed.
  if (typeof aiPlayTurn === 'function') {
    const orig = aiPlayTurn;
    aiPlayTurn = function (playerIndex) {
      if (!tutActive) { orig(playerIndex); return; }
      const beat = tutBeat();
      if (playerIndex !== 1 || !beat || beat.kind !== 'ai') return;  // not this beat's turn
      const name = CARD_LIBRARY[beat.card] && CARD_LIBRARY[beat.card].name;
      const idx  = players[1].hand.findIndex(c => c.name === name);
      if (idx === -1) { tutBail(); return; }
      playCard(1, idx);
    };
  }
})();
