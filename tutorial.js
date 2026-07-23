// ===== INTERACTIVE TUTORIAL (index.html only) ==============================
// Spotlight walkthrough over the live game screen: dims everything except the
// highlighted element and shows a tooltip. Informational steps advance with
// "Далее"; interactive steps wait for the real action (tap a card, play the
// serve, reposition/pass) — game functions are wrapped below to report them.
//
// Started from the main menu via startTutorial(). Restarts the match so the
// human always serves the first point.

/* eslint-disable no-undef */

const TUT_STEPS = {
  welcome: {
    target: null,
    text: '<strong>Добро пожаловать в MyTennis!</strong><br>Это карточный теннис: каждый удар — розыгрыш карты и бросок кубиков. Пройдём по всем элементам экрана и сыграем первую подачу.',
    next: 'score',
  },
  score: {
    target: '#tennis-score',
    text: 'Это счёт вашей партии. Счёт в теннисе ведётся внутри гейма по схеме 0–15–30–40–гейм; при счёте 40:40 играется «больше-меньше» до преимущества в 2 розыгрыша. Весь гейм подаёт один игрок, каждый гейм подающий чередуется. Обычный теннисный сет состоит из 6 геймов.',
    next: 'court',
  },
  court: {
    target: '#app-court-wrap',
    text: 'Это игровое поле. На каждой стороне 3 зоны — «Слева», «Справа» и «Сетка». В момент подачи игроки стоят по диагонали, гейм начинается справа, после каждого розыгрыша стартовый угол чередуется. Ряд ударов позволяет вывести соперника из позиции — ударить туда, где его нет. А после своего удара можно перебежать в любую зону ценой сброса любой карты.',
    next: 'turn',
  },
  turn: {
    target: '#current-turn',
    text: '«Текущий ход» показывает последнюю сыгранную карту, кому она летит, и её характеристики: Силу, Спин и особые свойства. Сложность удара в теннисе зависит от силы и вращения мяча — здесь сложность входящего удара считается как его Сила + Спин.',
    next: 'dice',
  },
  dice: {
    target: '#player1-dice',
    text: 'Результаты последнего броска кубиков: кто бросал и что выпало. Вы успешно отбиваете мяч, если сумма 2 кубиков + 6 больше, чем сложность удара противника + Сила вашего удара − Спин вашего удара. К расчёту добавляются модификаторы карты и усталость. Кубики 1/1 — всегда ошибка, 6/6 — всегда успех.',
    next: 'log',
  },
  log: {
    target: '#app-log',
    text: 'В журнале действий — подробная история партии: каждый удар, перемещение и прочие события. Нажмите на строку, чтобы открыть весь журнал.',
    next: 'opponent',
  },
  opponent: {
    target: '#player2',
    text: 'Данные вашего противника: выбранная сложность ИИ, его усталость 💤, текущая позиция и её статус, количество карт в колоде 🂠, в сбросе и в руке ✋.',
    next: 'you',
  },
  you: {
    target: '#player1',
    text: 'А в этом блоке — ваши характеристики, карты и возможные действия.',
    next: 'fatigue',
  },
  fatigue: {
    target: '#player1 .st-fat',
    text: 'Усталость влияет на каждый ваш удар — она вычитается из результата броска кубиков. Усталость растёт, когда вы перебегаете в другую зону или добираете карту: чем дольше розыгрыш, тем сложнее. Между розыгрышами усталость сбрасывается.',
    next: 'position',
  },
  position: {
    target: '#player1 .st-pos',
    text: 'Ваша позиция: справа, слева или у сетки. Если противник прицельно ударил туда, где вас нет, вы увидите статус «вне позиции» — тогда вместо 2 кубиков вы бросаете только 1 (и правило 1/1–6/6 не действует). Отбить такой мяч значительно сложнее.',
    next: 'decks',
  },
  decks: {
    target: '#player1 .st-deck',
    text: 'Ваша колода и колода оппонента одинаковы. Сыгранные и сброшенные карты отправляются в сброс. Сброс возвращается в колоду, когда колода заканчивается или начинается новый гейм.',
    next: 'draw',
  },
  draw: {
    target: '#player1 .draw-btn',
    text: 'Эта кнопка добирает карту. Максимум карт в руке — 5. Добирать можно только перед своим ходом, каждая добранная карта даёт +1 усталости.',
    next: 'serves',
  },
  serves: {
    target: '#player1 .hand',
    text: 'В начале розыгрыша вам всегда даются 2 попытки подачи. В настоящем теннисе первой обычно подают самую сильную: на ней можно рискнуть — если ошибётесь, останется вторая. Ошибка на обеих подачах — проигранное очко.',
    next: 'cardinfo',
  },
  cardinfo: {
    target: '#player1 .hand',
    text: 'Нажмите на любую карту, чтобы подробнее почитать про её свойства и механики.',
    waitFor: 'cardsheet-close',
    hint: '👆 Нажмите на карту',
  },
  discard: {
    target: '#player1 .hand',
    text: 'Кстати: во время розыгрыша (не на подаче) можно отметить галочкой одну карту в руке — она сбросится вместе с вашим ударом и даст бонус по цвету: 🔴 +2 Силы, 🔵 +1 Спин, 🟢 бесплатный добор.',
    next: 'play',
  },
  play: {
    target: '#player1 .hand',
    text: 'Пора подавать! Нажмите «▶ Играть» на карте подачи.',
    waitFor: 'played',
    hint: '👆 Нажмите «▶ Играть»',
  },
  serve2: {
    target: '#player1 .hand',
    text: 'Ошибка подачи! Ничего страшного — есть вторая попытка. Сыграйте вторую подачу.',
    waitFor: 'played',
    hint: '👆 Сыграйте вторую подачу',
    numAs: 'play',
  },
  fault2: {
    target: '#player1',
    text: 'Двойная ошибка — очко сопернику, так бывает! Нажмите «🎾 Новый розыгрыш» и подайте снова.',
    waitFor: 'played',
    hint: '👆 «Новый розыгрыш», затем подача',
    numAs: 'play',
  },
  reposition: {
    target: '#player1',
    text: 'Отличная подача! Теперь вы можете перебежать в другую зону (кнопки на картах — это сброс карты, +1 усталости) или сразу передать ход противнику кнопкой «✓ Передать ход».',
    waitFor: 'reposition',
    hint: '👆 Перебегите или передайте ход',
  },
  final: {
    target: null,
    text: '<strong>Обучение завершено!</strong><br>Дальше игра идёт по-настоящему: следите за усталостью и позицией. Когда розыгрыш закончится, нажмите «🎾 Новый розыгрыш», чтобы начать следующий. Удачи!',
    next: null,
    nextLabel: 'Играть!',
  },
};

// Display order for the "Шаг N из M" counter (welcome/final are unnumbered)
const TUT_ORDER = ['score', 'court', 'turn', 'dice', 'log', 'opponent', 'you',
  'fatigue', 'position', 'decks', 'draw', 'serves', 'cardinfo', 'discard',
  'play', 'reposition'];

let tutActive = false;
let tutCurrent = null;
let tutEls = null;

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

function tutPosition() {
  const step = TUT_STEPS[tutCurrent];
  if (!tutActive || !step || !tutEls) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const { shades, blocker, ring, tip } = tutEls;
  const el = step.target ? document.querySelector(step.target) : null;

  if (!el) {
    // Centered modal: one full-screen shade, no ring/blocker
    tutSetBox(shades[0], 0, 0, vw, vh);
    shades[1].style.display = shades[2].style.display = shades[3].style.display = 'none';
    ring.style.display = 'none';
    blocker.style.display = 'none';
    tip.style.display = 'block';
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

  tutSetBox(shades[0], 0, 0, vw, r.top);                              // top
  tutSetBox(shades[1], 0, r.bottom, vw, vh - r.bottom);               // bottom
  tutSetBox(shades[2], 0, r.top, r.left, r.bottom - r.top);           // left
  tutSetBox(shades[3], r.right, r.top, vw - r.right, r.bottom - r.top); // right
  tutSetBox(ring, r.left, r.top, r.right - r.left, r.bottom - r.top);

  // Informational steps also block the hole itself; interactive steps let
  // taps reach the highlighted element.
  if (step.waitFor) blocker.style.display = 'none';
  else tutSetBox(blocker, r.left, r.top, r.right - r.left, r.bottom - r.top);

  // Tooltip below the hole when it's in the upper half, above otherwise
  tip.style.display = 'block';
  const tipW = tip.offsetWidth, tipH = tip.offsetHeight;
  const centerX = (r.left + r.right) / 2;
  tip.style.left = Math.min(Math.max(8, centerX - tipW / 2), vw - tipW - 8) + 'px';
  tip.style.top = (r.bottom < vh * 0.55
    ? Math.min(r.bottom + 10, vh - tipH - 8)
    : Math.max(8, r.top - tipH - 10)) + 'px';
}

function showTutStep(id) {
  const step = TUT_STEPS[id];
  if (!step) { endTutorial(); return; }

  // Skip steps whose target element isn't on screen right now
  if (step.target && !document.querySelector(step.target)) {
    if (typeof step.next === 'string') { showTutStep(step.next); return; }
    endTutorial();
    return;
  }

  tutCurrent = id;
  tutEnsureDom();
  const { tip } = tutEls;

  const numIdx = TUT_ORDER.indexOf(step.numAs || id);
  const numHtml = numIdx > -1 ? `Шаг ${numIdx + 1} из ${TUT_ORDER.length}` : 'Обучение';
  const actionHtml = step.waitFor
    ? `<span class="tut-hint">${step.hint || ''}</span>`
    : `<button class="tut-next">${step.nextLabel || 'Далее ›'}</button>`;
  tip.innerHTML = `
    <div class="tut-step-num">${numHtml}</div>
    <div class="tut-text">${step.text}</div>
    <div class="tut-actions">
      <button class="tut-skip">Пропустить</button>
      ${actionHtml}
    </div>`;
  tip.querySelector('.tut-skip').onclick = endTutorial;
  const nextBtn = tip.querySelector('.tut-next');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (typeof step.next === 'string') showTutStep(step.next);
      else endTutorial();
    };
  }

  const el = step.target ? document.querySelector(step.target) : null;
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'auto' });
  // Position after scroll/layout settles (setTimeout, not rAF — rAF stalls
  // in backgrounded tabs and the tooltip would never appear)
  setTimeout(tutPosition, 80);
}

function startTutorial() {
  tutEnsureDom();
  tutActive = true;
  startGame();               // fresh match — the human serves the first point
  window.addEventListener('resize', tutPosition);
  showTutStep('welcome');
}

function endTutorial() {
  tutActive = false;
  tutCurrent = null;
  window.removeEventListener('resize', tutPosition);
  if (!tutEls) return;
  [...tutEls.shades, tutEls.blocker, tutEls.ring, tutEls.tip]
    .forEach(el => { el.style.display = 'none'; });
}

// ── Advancement on real game actions ───────────────────────────────────────

// After the player's card resolves, pick the branch that matches the outcome.
function tutAfterPlay() {
  if (!tutActive) return;
  // Nothing changed → the play was rejected (blocked card etc.), stay put
  if (incomingPower === 0 && serveAttempt === 1 && !pendingPointEnd) { tutPosition(); return; }
  if (pendingPointEnd) { showTutStep('fault2'); return; }                       // double fault
  if (serveAttempt === 2 && incomingPower === 0) { showTutStep('serve2'); return; } // first-serve fault
  if (canDiscardForPosition === 0) { showTutStep('reposition'); return; }       // serve landed
  showTutStep('final');
}

window.__tutorialNotify = function (note, playerIndex) {
  if (!tutActive) return;
  if (note === 'played' && playerIndex === 0 &&
      ['cardinfo', 'discard', 'play', 'serve2', 'fault2'].includes(tutCurrent)) {
    // "played" may arrive from the cardinfo/discard steps too — the hand is
    // tappable there and the play buttons are live.
    setTimeout(tutAfterPlay, 450);
    return;
  }
  if (note === 'reposition' && tutCurrent === 'reposition') { showTutStep('final'); return; }
  if (note === 'cardsheet-close' && tutCurrent === 'cardinfo') { showTutStep('discard'); return; }
};

// Wrap the game actions the tutorial listens for. Function declarations are
// reassignable globals, and inline onclick handlers resolve them at call time.
(function tutHookGameActions() {
  if (typeof playCard === 'function') {
    const orig = playCard;
    playCard = function (playerIndex, cardIndex) {
      orig(playerIndex, cardIndex);
      if (window.__tutorialNotify) window.__tutorialNotify('played', playerIndex);
    };
  }
  if (typeof aiPassTurn === 'function') {
    const orig = aiPassTurn;
    aiPassTurn = function (playerIndex) {
      orig(playerIndex);
      if (window.__tutorialNotify) window.__tutorialNotify('reposition', playerIndex);
    };
  }
  if (typeof discardForPosition === 'function') {
    const orig = discardForPosition;
    discardForPosition = function (playerIndex, cardIndex, newPosition) {
      orig(playerIndex, cardIndex, newPosition);
      if (window.__tutorialNotify) window.__tutorialNotify('reposition', playerIndex);
    };
  }
})();
