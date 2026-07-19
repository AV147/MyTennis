#!/usr/bin/env node
/**
 * Headless v3 trainer.
 *
 * Runs the real game modules (no logic is duplicated here) in a vm context so
 * training can go far past what in-browser training can reach — hundreds of
 * thousands of points in minutes instead of 16k.
 *
 * Usage:
 *   node train-v3-node.js [--points N] [--profile pure|style] [--opp v1|v2|self]
 *                         [--out FILE] [--resume FILE] [--seed N] [--evals N] [--quiet]
 *
 * Examples:
 *   # phase 1 — bootstrap against the heuristic
 *   node train-v3-node.js --points 200000 --opp v2 --out w-p1.json
 *   # phase 2 — self-play, continuing from phase 1
 *   node train-v3-node.js --points 300000 --opp self --resume w-p1.json --out w-p2.json
 *
 * Without --resume the weights are reinitialised, so every run starts from
 * scratch — use it to chain training phases.
 *
 * Prints a learning curve with the health metrics that matter for this network:
 *   maxLogit — pre-softmax magnitude. If this climbs past ~50 the policy is
 *              saturating and the run is going the way of the old weights.
 *   entropy  — per-head. Approaching 0 means the policy has gone deterministic.
 *   h2act    — fraction of second-layer units with a positive pre-activation.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const FILES = [
  'config.js', 'decks.js', 'deck-utils.js', 'shot-resolution.js',
  'ai-v3.js', 'ai-simulate-v1.js', 'ai-simulate-v2.js', 'ai-simulate-v3.js',
  'ai-simulate.js', 'ai-v3-train.js'
];

// ── CLI ────────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const OPTS = {
  points:  Number(arg('points', 200000)),
  profile: String(arg('profile', 'pure')),
  opp:     String(arg('opp', 'v2')),
  out:     String(arg('out', '')),
  resume:  String(arg('resume', '')),
  seed:    Number(arg('seed', 20260719)),
  evals:   Number(arg('evals', 10)),
  quiet:   !!arg('quiet', false)
};

// ── Context ────────────────────────────────────────────────────────────────
const sandbox = { console };
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

vm.runInContext(`
function __mkRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synchronous training loop — trainV3() is setTimeout-driven for the browser. */
function trainSync(totalPoints, oppKey, profile, seed, onChunk, chunkSize, resumeJson) {
  V3_REWARD_PROFILE = profile;
  Math.random = __mkRandom(seed);
  // Resuming keeps the weights but always restarts Adam: its moment estimates
  // describe the previous phase's gradients and carrying them into a new
  // opponent would fight the first few hundred steps.
  if (resumeJson) v3WeightsFromJSON(resumeJson); else v3InitWeights();
  v3AdamInit();
  v3Baseline = 0;

  const OPP = { v1: SimAIv1, v2: SimAIv2, self: SimAIv3 };
  const oppEngine = OPP[oppKey] || SimAIv2;

  const p0 = simClonePlayer(0, 'BR');
  const p1 = simClonePlayer(1, 'BR');
  p0.deck = shuffle([...p0.deck]);
  p1.deck = shuffle([...p1.deck]);

  let pending = [], wins = 0, servingIdx = 0, s0 = 0, s1 = 0, lastStep = null;

  for (let done = 0; done < totalPoints; done++) {
    const startPos = done % 2 === 0 ? 'BR' : 'BL';
    const v3Idx    = done % 4 < 2 ? 0 : 1;
    const r = simRunPointV3Train(p0, p1, servingIdx, startPos, v3Idx, oppEngine);

    const finished = v3FinishTrajectory(r.trajectory, r.winner, v3Idx);
    if (finished) pending.push(finished);
    if (pending.length >= V3_BATCH_POINTS) { lastStep = v3TrainStep(pending); pending = []; }
    if (r.winner === v3Idx) wins++;

    if (r.winner === 0) s0++; else s1++;
    if ((s0 >= 4 || s1 >= 4) && Math.abs(s0 - s1) >= 2) {
      s0 = 0; s1 = 0; servingIdx = 1 - servingIdx;
      [p0, p1].forEach(p => {
        p.discard.push(...p.hand, ...(p.temporaryRemovedServes || []));
        p.hand = []; p.temporaryRemovedServes = [];
        p.deck = shuffle([...p.deck, ...p.discard]); p.discard = [];
      });
    }

    if (chunkSize && (done + 1) % chunkSize === 0) {
      onChunk(done + 1, wins, lastStep);
      // evaluation reseeds Math.random, so restore the training stream
      Math.random = __mkRandom(seed + done + 1);
    }
  }
  if (pending.length) lastStep = v3TrainStep(pending);
  return { wins, lastStep };
}

/** Greedy v3 (SimAIv3) vs SimAIv2, both seatings. Uses current weights. */
function evalVsV2(numPoints, seed) {
  const saved = Math.random;
  function side(v3First) {
    Math.random = __mkRandom(seed);
    const p0 = simClonePlayer(0, 'BR'), p1 = simClonePlayer(1, 'BR');
    const e0 = v3First ? SimAIv3 : SimAIv2;
    const e1 = v3First ? SimAIv2 : SimAIv3;
    const v3Slot = v3First ? 0 : 1;
    let serving = 0, s0 = 0, s1 = 0, v3wins = 0, netEnd = 0, netLoss = 0, shots = 0;
    for (let pt = 0; pt < numPoints; pt++) {
      const r = simRunPoint(p0, p1, serving, pt % 2 === 0 ? 'BR' : 'BL', e0, e1);
      shots += r.cardsPlayed.length;
      if (r.winner === v3Slot) v3wins++;
      const v3p = [p0, p1][v3Slot];
      if (v3p.position === 'Net') { netEnd++; if (r.winner !== v3Slot) netLoss++; }
      if (r.winner === 0) s0++; else s1++;
      if ((s0 >= 4 || s1 >= 4) && Math.abs(s0 - s1) >= 2) {
        s0 = 0; s1 = 0; serving = 1 - serving;
        [p0, p1].forEach(p => {
          p.deck = shuffle([...p.deck, ...p.discard, ...p.hand, ...(p.temporaryRemovedServes || [])]);
          p.discard = []; p.hand = []; p.temporaryRemovedServes = [];
        });
      }
    }
    return { win: v3wins / numPoints, netEnd: netEnd / numPoints,
             netLoss: netLoss / numPoints, shots: shots / numPoints };
  }
  const a = side(true), b = side(false);
  Math.random = saved;
  return {
    winPct:     (a.win + b.win) / 2 * 100,
    netEndPct:  (a.netEnd + b.netEnd) / 2 * 100,
    netLossPct: (a.netLoss + b.netLoss) / 2 * 100,
    rally:      (a.shots + b.shots) / 2
  };
}
`, ctx);

// ── Run ────────────────────────────────────────────────────────────────────
const EVAL_POINTS = 4000;
const chunk = Math.max(1, Math.floor(OPTS.points / Math.max(1, OPTS.evals)));

if (!OPTS.quiet) {
  console.log(`\n🎾 v3 training — profile "${OPTS.profile}", opponent ${OPTS.opp}, ` +
              `${OPTS.points.toLocaleString('ru')} points, seed ${OPTS.seed}\n`);
  console.log('  progress │ trainWR │ maxLogit │  entCard  entMove  entDraw │ h2act │  vs v2   atNet  lostNet  rally');
  console.log('  ─────────┼─────────┼──────────┼───────────────────────────┼───────┼──────────────────────────────');
}

const rows = [];
ctx.__onChunk = (done, wins, step) => {
  const ev = vm.runInContext(`evalVsV2(${EVAL_POINTS}, 4242)`, ctx);
  const s = step || {};
  rows.push({ done, trainWR: wins / done * 100, ...s, ...ev });
  if (OPTS.quiet) return;
  const pct = (done / OPTS.points * 100).toFixed(0).padStart(3);
  console.log(
    `  ${pct}% ${String(done).padStart(7)} │ ${(wins / done * 100).toFixed(1).padStart(6)}% │ ` +
    `${(s.maxLogit || 0).toFixed(1).padStart(8)} │ ` +
    `${(s.entCard || 0).toFixed(3).padStart(8)} ${(s.entMove || 0).toFixed(3).padStart(7)} ${(s.entDraw || 0).toFixed(3).padStart(8)} │ ` +
    `${((s.h2ActiveFrac || 0) * 100).toFixed(0).padStart(4)}% │ ` +
    `${ev.winPct.toFixed(1).padStart(6)}% ${ev.netEndPct.toFixed(1).padStart(6)}% ${ev.netLossPct.toFixed(1).padStart(7)}% ${ev.rally.toFixed(2).padStart(6)}`
  );
};

if (OPTS.resume) {
  ctx.__resume = JSON.parse(fs.readFileSync(path.join(ROOT, OPTS.resume), 'utf8'));
  if (!OPTS.quiet) console.log(`  продолжаю с весов: ${OPTS.resume}\n`);
} else {
  ctx.__resume = null;
}

const t0 = Date.now();
const result = vm.runInContext(
  `trainSync(${OPTS.points}, ${JSON.stringify(OPTS.opp)}, ${JSON.stringify(OPTS.profile)}, ` +
  `${OPTS.seed}, __onChunk, ${chunk}, __resume)`, ctx, { timeout: 3600000 });
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const final = vm.runInContext(`evalVsV2(20000, 909090)`, ctx);
const wstat = vm.runInContext(`
  (function(){ const o = {}; for (const k of Object.keys(v3W)) {
    let m = 0, mx = 0; const a = v3W[k];
    for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); m += v; if (v > mx) mx = v; }
    o[k] = { absMean: +(m / a.length).toFixed(3), absMax: +mx.toFixed(2) };
  } return o; })()
`, ctx);

console.log(`\n  done in ${secs}s`);
console.log(`\n  FINAL (20 000 очков против v2, оба рассаживания):`);
console.log(`    очков      : ${final.winPct.toFixed(2)}%   ${final.winPct > 50 ? '✓ сильнее v2' : '✗ слабее v2'}`);
console.log(`    закончил у сетки : ${final.netEndPct.toFixed(2)}%`);
console.log(`    проиграл у сетки : ${final.netLossPct.toFixed(2)}%   (было 11.2% у старых весов)`);
console.log(`    длина розыгрыша  : ${final.rally.toFixed(2)}`);
console.log(`\n  веса (absMean / absMax):`);
for (const k of ['W1', 'b1', 'W2', 'b2', 'W_draw', 'W_card', 'W_move'])
  console.log(`    ${k.padEnd(7)} ${String(wstat[k].absMean).padStart(7)} / ${wstat[k].absMax}`);

if (OPTS.out) {
  const json = vm.runInContext('v3WeightsToJSON()', ctx);
  fs.writeFileSync(path.join(ROOT, OPTS.out), json);
  console.log(`\n  ✓ веса сохранены: ${OPTS.out}\n`);
} else {
  console.log('\n  (--out не задан, веса не сохранены)\n');
}
