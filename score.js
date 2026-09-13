/* =====================================================
   score.js — standalone tennis scorekeeper (score.html)
   Пишется вручную свайпами; правила счёта считаются сами.

   Формат матча:
     tb   — только тай-брейк (до 7 или до 10)
     set1 — один сет (из 4, 6 или 8 геймов)
     bo3  — до 2 побед в сетах (сет из 4 или 6)
     bo5  — до 3 побед в сетах (сет из 4 или 6)
     free — произвольный счёт: бесконечный тай-брейк без подачи,
            геймов и победителя (счёт розыгрышей на тренировке)

   Сет: выигрыш при setGames геймах с отрывом в 2;
        при равенстве setGames-setGames — тай-брейк до 7.
   Решающий сет (bo3 при 1:1, bo5 при 2:2): спрашиваем в
   момент, когда он возникает — тай-брейк до 10 или сет.
   ===================================================== */

'use strict';

const STORAGE_KEY = 'mytennis-scorekeeper-v1';
const NAMES = ['Игрок 1', 'Игрок 2'];

const FORMAT_TITLES = {
  tb:   'Тайбрейк',
  set1: '1 сет',
  bo3:  'До 2 побед',
  bo5:  'До 3 побед'
};

/* ── Состояние ────────────────────────────────────── */
let S = null;      // текущее состояние матча
let HIST = [];     // стек { s: снимок до очка, w: кто выиграл очко }
let pendingCfg = null;

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ═══════════════════════════════════════════════════
   ДВИЖОК СЧЁТА
   ═══════════════════════════════════════════════════ */

function freshState(cfg) {
  const s = {
    cfg,                    // { mode, setGames, tbTarget, setsToWin, server }
    finishedSets: [],       // [{ a, b, tb:[x,y]|null, isTB }]
    setsWon: [0, 0],
    games: [0, 0],
    points: [0, 0],
    inTB: false,
    tbTarget: 7,
    tbFirstServer: cfg.server,
    deciderTB: false,       // текущий тай-брейк заменяет решающий сет
    decider: null,          // 'tb10' | 'set' — выбор игроков
    needDecider: false,     // ждём ответа в модалке
    gameServer: cfg.server, // кто подаёт текущий гейм
    winner: null
  };
  if (cfg.mode === 'tb') startTiebreak(s, cfg.tbTarget, true);
  return s;
}

function startTiebreak(s, target, asMatch) {
  s.inTB = true;
  s.tbTarget = target;
  s.deciderTB = !!asMatch;
  s.tbFirstServer = s.gameServer;
  s.points = [0, 0];
}

function currentServer(s) {
  if (s.inTB) {
    const n = s.points[0] + s.points[1];
    // первая подача — одно очко, дальше по два
    return (s.tbFirstServer + Math.floor((n + 1) / 2)) % 2;
  }
  return s.gameServer;
}

function awardPoint(s, w) {
  if (s.winner !== null || s.needDecider) return;
  s.points[w]++;
  if (s.cfg.mode === 'free') return;   // просто счётчик розыгрышей
  const a = s.points[w], b = s.points[1 - w];

  if (s.inTB) {
    if (a >= s.tbTarget && a - b >= 2) winTiebreak(s, w);
  } else {
    if (a >= 4 && a - b >= 2) winGame(s, w);
  }
}

function winGame(s, w) {
  s.points = [0, 0];
  s.gameServer = 1 - s.gameServer;
  s.games[w]++;

  const need = s.cfg.setGames;
  const g = s.games[w], o = s.games[1 - w];

  if (g >= need && g - o >= 2)      winSet(s, w, null);
  else if (g === need && o === need) startTiebreak(s, 7, false);
}

function winTiebreak(s, w) {
  const tb = [s.points[0], s.points[1]];
  s.inTB = false;

  if (s.deciderTB) {
    // тай-брейк вместо сета (решающий сет или формат «Тайбрейк»)
    s.deciderTB = false;
    s.points = [0, 0];
    finishSet(s, w, { a: tb[0], b: tb[1], tb: null, isTB: true });
  } else {
    // тай-брейк внутри сета: 7-6
    s.games[w]++;
    s.gameServer = 1 - s.tbFirstServer; // кто начинал тай-брейк — принимает в след. сете
    winSet(s, w, tb);
  }
}

function winSet(s, w, tb) {
  finishSet(s, w, { a: s.games[0], b: s.games[1], tb: tb, isTB: false });
}

function finishSet(s, w, entry) {
  s.finishedSets.push(entry);
  s.setsWon[w]++;
  s.games = [0, 0];
  s.points = [0, 0];

  const need = s.cfg.setsToWin;
  if (s.setsWon[w] >= need) { s.winner = w; return; }

  // решающий сет? (bo3 при 1:1, bo5 при 2:2)
  if (s.setsWon[0] === need - 1 && s.setsWon[1] === need - 1 && s.decider === null) {
    s.needDecider = true;
  }
}

function applyDecider(s, choice) {
  s.decider = choice;
  s.needDecider = false;
  if (choice === 'tb10') startTiebreak(s, 10, true);
}

/* ── Отображение очков в гейме ────────────────────── */
function pointLabel(s, i) {
  if (s.inTB || s.cfg.mode === 'free') return String(s.points[i]);
  const a = s.points[i], b = s.points[1 - i];
  if (a >= 3 && b >= 3) {
    if (a === b) return '40';
    return a > b ? 'AD' : '40';
  }
  return ['0', '15', '30', '40'][Math.min(a, 3)];
}

/* ═══════════════════════════════════════════════════
   DOM
   ═══════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ['format', 'detail', 'server', 'match'].forEach((n) => {
    $('screen-' + n).classList.toggle('active', n === name);
  });
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

function buzz(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

/* ═══════════════════════════════════════════════════
   НАСТРОЙКА МАТЧА
   ═══════════════════════════════════════════════════ */
const DETAIL_OPTIONS = {
  tb: {
    label: 'До скольки очков?',
    items: [
      { text: 'Тай-брейк до 7',  sub: 'с разницей в 2 очка', cfg: { tbTarget: 7 } },
      { text: 'Тай-брейк до 10', sub: 'с разницей в 2 очка', cfg: { tbTarget: 10 } }
    ]
  },
  set1: {
    label: 'Какой сет?',
    items: [
      { text: 'Сет из 4 геймов',   sub: 'при 4:4 — тай-брейк до 7', cfg: { setGames: 4 } },
      { text: 'Сет из 6 геймов',   sub: 'при 6:6 — тай-брейк до 7', cfg: { setGames: 6 } },
      { text: 'Расширенный сет',   sub: '8 геймов, при 8:8 — тай-брейк до 7', cfg: { setGames: 8 } }
    ]
  },
  bo3: {
    label: 'Какие сеты?',
    items: [
      { text: 'Сеты из 4 геймов', sub: 'при 4:4 — тай-брейк до 7', cfg: { setGames: 4 } },
      { text: 'Сеты из 6 геймов', sub: 'при 6:6 — тай-брейк до 7', cfg: { setGames: 6 } }
    ]
  },
  bo5: {
    label: 'Какие сеты?',
    items: [
      { text: 'Сеты из 4 геймов', sub: 'при 4:4 — тай-брейк до 7', cfg: { setGames: 4 } },
      { text: 'Сеты из 6 геймов', sub: 'при 6:6 — тай-брейк до 7', cfg: { setGames: 6 } }
    ]
  }
};

const SETS_TO_WIN = { tb: 1, set1: 1, bo3: 2, bo5: 3, free: 1 };

function openDetail(mode) {
  pendingCfg = { mode: mode, setsToWin: SETS_TO_WIN[mode], setGames: 6, tbTarget: 7 };
  const def = DETAIL_OPTIONS[mode];
  $('detail-crumb').textContent = FORMAT_TITLES[mode];
  $('detail-label').textContent = def.label;

  const box = $('detail-options');
  box.innerHTML = '';
  def.items.forEach((item) => {
    const b = document.createElement('button');
    b.className = 'opt-btn';
    b.innerHTML = item.text + (item.sub ? '<small>' + item.sub + '</small>' : '');
    b.addEventListener('click', () => {
      Object.assign(pendingCfg, item.cfg);
      openServerPick();
    });
    box.appendChild(b);
  });
  showScreen('detail');
}

function openServerPick() {
  const c = pendingCfg;
  let crumb = FORMAT_TITLES[c.mode];
  crumb += c.mode === 'tb' ? ' · до ' + c.tbTarget
                           : ' · сет из ' + c.setGames;
  $('server-crumb').textContent = crumb;
  showScreen('server');
}

function startMatch(server) {
  pendingCfg.server = server;
  S = freshState(pendingCfg);
  HIST = [];
  showScreen('match');
  render();
  save();
}

/* ═══════════════════════════════════════════════════
   ДЕЙСТВИЯ
   ═══════════════════════════════════════════════════ */
function addPoint(i) {
  if (!S || S.winner !== null || S.needDecider) return;
  HIST.push({ s: clone(S), w: i });
  if (HIST.length > 400) HIST.shift();
  awardPoint(S, i);
  render('up', i);
  save();
  buzz(12);
}

function undo(fromPlayer) {
  if (!HIST.length) { toast('Отменять нечего'); return false; }
  if (fromPlayer !== undefined && HIST[HIST.length - 1].w !== fromPlayer) {
    toast('Последнее очко — у соперника');
    return false;
  }
  S = HIST.pop().s;
  render('down', fromPlayer);
  save();
  buzz(12);
  return true;
}

function newMatch() {
  S = null;
  HIST = [];
  localStorage.removeItem(STORAGE_KEY);
  closeModals();
  showScreen('format');
}

/* ═══════════════════════════════════════════════════
   РЕНДЕР
   ═══════════════════════════════════════════════════ */
function formatLabel() {
  const c = S.cfg;
  if (c.mode === 'free') return 'Произвольный счёт';
  if (c.mode === 'tb') return 'Тайбрейк до ' + c.tbTarget;
  if (c.mode === 'set1' && c.setGames === 8) return 'Расширенный сет · 8';
  return FORMAT_TITLES[c.mode] + ' · из ' + c.setGames;
}

function currentCell(i) {
  return (S.deciderTB || S.cfg.mode === 'tb') ? S.points[i] : S.games[i];
}

function renderScoreboard() {
  const srv = S.winner === null ? currentServer(S) : -1;
  for (let i = 0; i < 2; i++) {
    $('sb-row-' + i).classList.toggle('serving', srv === i);
    const cells = $('sb-cells-' + i);
    cells.innerHTML = '';

    S.finishedSets.forEach((set) => {
      const mine = i === 0 ? set.a : set.b;
      const other = i === 0 ? set.b : set.a;
      const d = document.createElement('span');
      d.className = 'sb-cell' + (mine > other ? ' won' : '');
      d.textContent = mine;
      if (set.tb) {
        const lost = set.tb[i] < set.tb[1 - i];
        if (lost) d.innerHTML = mine + '<sup>' + set.tb[i] + '</sup>';
      }
      cells.appendChild(d);
    });

    if (S.winner === null) {
      const d = document.createElement('span');
      d.className = 'sb-cell current';
      d.textContent = currentCell(i);
      cells.appendChild(d);
    }
  }
}

function ghostUp(i) {
  const c = clone(S);
  awardPoint(c, i);
  if (c.winner !== null) return 'МАТЧ';
  if (c.finishedSets.length !== S.finishedSets.length) return 'СЕТ';
  if (c.games[0] !== S.games[0] || c.games[1] !== S.games[1]) return 'ГЕЙМ';
  return pointLabel(c, i);
}

function ghostDown(i) {
  if (!HIST.length || HIST[HIST.length - 1].w !== i) return '';
  return pointLabel(HIST[HIST.length - 1].s, i);
}

function render(anim, animPlayer) {
  if (!S) return;
  $('format-label').textContent = formatLabel();
  $('btn-undo').disabled = !HIST.length;

  // «Произвольный»: ни табло по геймам, ни подачи — только два счётчика
  const free = S.cfg.mode === 'free';
  $('scoreboard').style.display   = free ? 'none' : '';
  $('serve-banner').style.display = free ? 'none' : '';
  if (!free) renderScoreboard();

  const srv = free ? -1 : currentServer(S);

  // подача
  if (free) {
    /* баннер скрыт */
  } else if (S.winner !== null) {
    $('serve-banner').innerHTML = '<span>Матч окончен</span>';
  } else if (S.needDecider) {
    $('serve-banner').innerHTML = '<span>Решающий сет — выберите формат</span>';
  } else {
    let html = 'Подаёт ' + NAMES[srv];
    if (S.inTB) {
      html += '<span class="tb-badge">Тай-брейк до ' + S.tbTarget + '</span>';
    }
    $('serve-banner').innerHTML = html;
  }

  // циферблаты
  for (let i = 0; i < 2; i++) {
    const val = $('val-' + i);
    const label = S.winner !== null ? (S.winner === i ? '★' : '–') : pointLabel(S, i);
    val.textContent = label;
    val.classList.toggle('ad', label === 'AD');
    $('ghost-up-' + i).textContent   = S.winner !== null || S.needDecider ? '' : ghostUp(i);
    $('ghost-down-' + i).textContent = S.winner !== null ? '' : ghostDown(i);
    $('dials').children[i === 0 ? 0 : 2].classList.toggle('serving', S.winner === null && srv === i);

    if (anim && (animPlayer === undefined || animPlayer === i)) {
      val.classList.remove('roll-up', 'roll-down');
      void val.offsetWidth;
      val.classList.add(anim === 'up' ? 'roll-up' : 'roll-down');
    }
  }

  // модалки
  if (S.needDecider) openModal('modal-decider');
  else closeModal('modal-decider');

  if (S.winner !== null) showWinner();
  else closeModal('modal-winner');
}

function matchScoreText() {
  return S.finishedSets.map((s) => {
    let t = s.a + ':' + s.b;
    if (s.tb) t += '(' + Math.min(s.tb[0], s.tb[1]) + ')';
    return t;
  }).join('  ');
}

function showWinner() {
  $('winner-title').textContent = 'Победил ' + NAMES[S.winner];
  $('winner-score').textContent = matchScoreText();
  openModal('modal-winner');
}

/* ── Модалки ──────────────────────────────────────── */
/* Модалка открывается по pointerup от тапа, а следом браузер шлёт click в ту
   же точку — и он попадает в кнопку, которая только что появилась под пальцем
   (матчбол тапом закрывал окно победы через «Отменить последнее очко»).
   Поэтому кнопки свежей модалки на MODAL_ARM_MS не кликаются. */
const MODAL_ARM_MS = 450;

function openModal(id) {
  const m = $(id);
  if (m.classList.contains('open')) return;   // уже открыта — защиту не перезапускаем
  m.classList.add('open', 'arming');
  setTimeout(() => m.classList.remove('arming'), MODAL_ARM_MS);
}
function closeModal(id) { $(id).classList.remove('open', 'arming'); }
function closeModals()  { document.querySelectorAll('.modal').forEach((m) => m.classList.remove('open', 'arming')); }

/* ═══════════════════════════════════════════════════
   СОХРАНЕНИЕ
   ═══════════════════════════════════════════════════ */
function save() {
  try {
    if (!S) { localStorage.removeItem(STORAGE_KEY); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ s: S, h: HIST }));
  } catch (e) { /* приватный режим — просто не сохраняем */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.s || !data.s.cfg) return false;
    S = data.s;
    HIST = data.h || [];
    return true;
  } catch (e) { return false; }
}

/* ═══════════════════════════════════════════════════
   СВАЙПЫ
   ═══════════════════════════════════════════════════ */
const SWIPE_MIN = 26;   // px — порог срабатывания свайпа
const TAP_MAX = 12;     // px — всё, что меньше, считаем тапом

function bindDial(el) {
  const i = Number(el.dataset.p);
  let startY = 0, startX = 0, active = false, fired = false;

  el.addEventListener('pointerdown', (e) => {
    active = true; fired = false;
    startY = e.clientY; startX = e.clientX;
    el.classList.add('pressed');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* не все движки дают capture */ }
  });

  el.addEventListener('pointermove', (e) => {
    if (!active || fired) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) < SWIPE_MIN) return;
    if (Math.abs(e.clientX - startX) > Math.abs(dy)) return;  // горизонтальный жест
    fired = true;
    if (dy < 0) addPoint(i);
    else if (!undo(i)) nudge(el);
  });

  const end = (e) => {
    if (!active) return;
    active = false;
    el.classList.remove('pressed');
    if (!fired) {
      const dy = Math.abs(e.clientY - startY), dx = Math.abs(e.clientX - startX);
      if (dy < TAP_MAX && dx < TAP_MAX) addPoint(i);   // тап = очко
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { active = false; el.classList.remove('pressed'); });
}

function nudge(el) {
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
}

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */
document.querySelectorAll('[data-mode]').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.mode === 'free') {
      // без деталей и без выбора подающего — сразу к счётчику
      pendingCfg = { mode: 'free', setsToWin: 1, setGames: 6, tbTarget: 7 };
      startMatch(0);
    } else {
      openDetail(b.dataset.mode);
    }
  });
});
document.querySelectorAll('[data-back]').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.back === 'detail') openDetail(pendingCfg.mode);
    else showScreen('format');
  });
});
document.querySelectorAll('[data-server]').forEach((b) => {
  b.addEventListener('click', () => startMatch(Number(b.dataset.server)));
});
document.querySelectorAll('[data-decider]').forEach((b) => {
  b.addEventListener('click', () => {
    applyDecider(S, b.dataset.decider);
    closeModal('modal-decider');
    render();
    save();
  });
});

$('btn-undo').addEventListener('click', () => undo());
$('btn-winner-undo').addEventListener('click', () => undo());
$('btn-new-match').addEventListener('click', newMatch);
$('btn-menu').addEventListener('click', () => openModal('modal-menu'));
$('btn-menu-resume').addEventListener('click', () => closeModal('modal-menu'));
$('btn-menu-new').addEventListener('click', newMatch);

document.querySelectorAll('.dial').forEach(bindDial);

if (load()) { showScreen('match'); render(); }
else showScreen('format');
