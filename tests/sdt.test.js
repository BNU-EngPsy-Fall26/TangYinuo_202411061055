/**
 * tests/sdt.test.js —— 信号检测论计算的单元自测（零依赖）
 * ---------------------------------------------------------------------------
 * 运行方式（需要 Node.js 18+，不需要 npm install 任何东西）：
 *
 *     cd sdt-sonar-lab
 *     node tests/sdt.test.js
 *
 * 覆盖内容：
 *   · 正态分布 pdf / cdf / 分位数 的数值正确性
 *   · d′、c、β、A′、AUC、准确率的手算校验
 *   · 完美被试（H=1 或 FA=0）触发的对数线性校正
 *   · d′/c ↔ 概率 的往返一致性
 *   · ROC 与 zROC 的形状性质
 *   · 最优判据 β* / c* 的公式
 *   · 刺激生成中"信号试次的目标频带能量高于噪音试次"
 *   · 试次序列严格按先验概率配比
 * ---------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 这些模块是给浏览器写的 IIFE，挂到 window 上；这里用一个最小的 window 替身加载它们
global.window = global;
const JS_DIR = path.join(__dirname, '..', 'js');
['utils.js', 'config.js', 'sdt.js', 'sonar.js', 'engine.js'].forEach(function (file) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(JS_DIR, file), 'utf8'));
});

const SDT = global.window.SDT;
const U = SDT.util;
const S = SDT.sdt;

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  \u2713 ' + name + (extra ? '   ' + extra : '')); }
  else { failed++; console.log('  \u2717 ' + name + (extra ? '   ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) < (tol === undefined ? 1e-6 : tol); }
function section(t) { console.log('\n' + t); }

/* ===================================================================== */
section('正态分布函数');
ok('Φ(0) = 0.5', near(U.normCdf(0), 0.5));
ok('Φ(1.96) ≈ 0.975', near(U.normCdf(1.96), 0.975, 1e-4), U.normCdf(1.96).toFixed(6));
ok('Φ(−1.645) ≈ 0.05', near(U.normCdf(-1.645), 0.05, 1e-4));
ok('Φ⁻¹(0.5) = 0', near(U.normInv(0.5), 0, 1e-9));
ok('Φ⁻¹(0.975) ≈ 1.959964', near(U.normInv(0.975), 1.959964, 1e-4));
ok('Φ 与 Φ⁻¹ 互逆', near(U.normCdf(U.normInv(0.23)), 0.23, 1e-7));
ok('φ 的峰值 = 1/√(2π)', near(U.normPdf(0), 1 / Math.sqrt(2 * Math.PI), 1e-12));

/* ===================================================================== */
section('SDT 核心指标（h=20, m=10, fa=5, cr=15 手算校验）');
// P(H)=2/3 → zH=0.430727 ; P(FA)=0.25 → zF=−0.674490
// d′ = 1.105217 ; c = 0.121881 ; β = exp(d′c) = 1.144199
const st = S.compute({ h: 20, m: 10, fa: 5, cr: 15 });
ok('P(H) = 20/30 = 0.6667', near(st.pH, 2 / 3, 1e-9));
ok('P(FA) = 5/20 = 0.25', near(st.pFA, 0.25, 1e-9));
ok('P(M) = 1 − P(H)', near(st.rates.pM, 1 / 3, 1e-9));
ok('P(CR) = 1 − P(FA)', near(st.rates.pCR, 0.75, 1e-9));
ok("d′ ≈ 1.105217", near(st.dprime, 1.105217, 1e-5), st.dprime.toFixed(6));
ok('c  ≈ 0.121881', near(st.c, 0.121881, 1e-5), st.c.toFixed(6));
ok('β  = exp(d′·c) ≈ 1.144199', near(st.beta, 1.144199, 1e-5), st.beta.toFixed(6));
ok('β  等价于 exp[(zF²−zH²)/2]',
  near(st.beta, Math.exp((st.zF * st.zF - st.zH * st.zH) / 2), 1e-9));
ok('判据位置 xc = c + d′/2', near(st.criterionX, st.c + st.dprime / 2, 1e-12));
ok('准确率 = 35/50 = 0.7', near(st.accuracy, 0.7, 1e-9));
ok('AUC = Φ(d′/√2)', near(st.auc, U.normCdf(st.dprime / Math.SQRT2), 1e-12));
ok('A′ 落在 (0.5, 1)', st.aPrime > 0.5 && st.aPrime < 1, st.aPrime.toFixed(4));
ok('未触发对数线性校正', st.corrected === false);

/* ===================================================================== */
section('完美被试（H=1, FA=0）触发对数线性校正');
const perfect = S.compute({ h: 20, m: 0, fa: 0, cr: 20 });
ok('corrected = true', perfect.corrected === true);
ok('d′ 保持有限（≈3.96）而非无穷大',
  isFinite(perfect.dprime) && perfect.dprime > 3.9 && perfect.dprime < 4.0, perfect.dprime.toFixed(4));
ok('已给出校正说明', perfect.warnings.length > 0);
ok('P(H) 校正为 20.5/21', near(perfect.pH, 20.5 / 21, 1e-9));
ok('P(FA) 校正为 0.5/21', near(perfect.pFA, 0.5 / 21, 1e-9));

/* ===================================================================== */
section('无辨别力与负 d′ 的边界情形');
const flat = S.compute({ h: 10, m: 10, fa: 10, cr: 10 });
ok('d′ = 0', near(flat.dprime, 0, 1e-9));
ok('β = 1', near(flat.beta, 1, 1e-9));
ok('准确率 = 0.5', near(flat.accuracy, 0.5, 1e-9));

const inverted = S.compute({ h: 5, m: 15, fa: 15, cr: 5 });
ok('按键按反时 d′ < 0', inverted.dprime < 0, inverted.dprime.toFixed(3));
ok('d′ < 0 时给出提示', inverted.warnings.some(function (w) { return w.indexOf('按反') >= 0; }));

const degenerate = S.compute({ h: 0, m: 0, fa: 5, cr: 15 });
ok('无信号试次时给出提示', degenerate.warnings.length > 0);

/* ===================================================================== */
section('d′ / c 与概率的往返一致性');
const f1 = S.fromDprimeC(1.5, 0.4);
ok('zH = d′/2 − c', near(f1.zH, 1.5 / 2 - 0.4, 1e-12));
ok('zF = −d′/2 − c', near(f1.zF, -1.5 / 2 - 0.4, 1e-12));
ok('P(H) = Φ(0.35)', near(f1.pH, U.normCdf(0.35), 1e-12));
const back = S.compute({
  h: f1.pH * 100, m: (1 - f1.pH) * 100,
  fa: f1.pFA * 100, cr: (1 - f1.pFA) * 100
});
ok('由概率反推 d′ 回到 1.5', near(back.dprime, 1.5, 1e-6));
ok('由概率反推 c 回到 0.4', near(back.c, 0.4, 1e-6));
ok('期望准确率 = P(S)·P(H) + P(N)·P(CR)',
  near(S.expectedAccuracy(1.5, 0.4, 0.6), 0.6 * f1.pH + 0.4 * (1 - f1.pFA), 1e-12));

/* ===================================================================== */
section('ROC 曲线形状');
const roc = S.rocCurve(1.5, 100);
ok('返回 101 个点', roc.length === 101);
ok('按"保守 → 宽松"排列，P(FA) 单调递增',
  roc.every(function (p, i) { return i === 0 || p.pFA >= roc[i - 1].pFA - 1e-12; }));
ok('按"保守 → 宽松"排列，P(H) 单调递增',
  roc.every(function (p, i) { return i === 0 || p.pH >= roc[i - 1].pH - 1e-12; }));
ok('起点接近 (0, 0)', roc[0].pFA < 1e-4 && roc[0].pH < 1e-3);
ok('终点接近 (1, 1)', roc[100].pFA > 0.999 && roc[100].pH > 0.999);
ok('曲线始终位于对角线上方',
  roc.every(function (p) { return p.pH >= p.pFA - 1e-12; }));
ok('d′ = 0 时曲线与对角线重合',
  S.rocCurve(0, 40).every(function (p) { return Math.abs(p.pH - p.pFA) < 1e-9; }));
ok("zROC 满足 z(H) − z(F) ≡ d′",
  S.zRocCurve(1.5, 40).every(function (p) { return Math.abs(p.zH - p.zF - 1.5) < 1e-12; }));

/* ===================================================================== */
section('最优判据（先验 + 支付矩阵）');
// β* = [P(N)/P(S)]·[(V_CR−V_FA)/(V_H−V_M)] = 1·(6/30) = 0.2 → c* = ln(0.2)/1.5
const opt = S.optimalCriterion(1.5, 0.5, { vH: 10, vCR: 2, vFA: -4, vM: -20 });
ok('β* = 0.2', near(opt.betaOpt, 0.2, 1e-9), opt.betaOpt.toFixed(6));
ok('c* = ln(β*)/d′', near(opt.cOpt, Math.log(0.2) / 1.5, 1e-12), opt.cOpt.toFixed(6));
ok('漏报代价高时最优标准偏宽松（c* < 0）', opt.cOpt < 0);
// 目标越罕见 → P(N)/P(S) 越大 → β* 越大 → 最优标准越保守（c* 越大）
const opt2 = S.optimalCriterion(1.5, 0.2, { vH: 10, vCR: 2, vFA: -4, vM: -20 });
ok('目标罕见时最优标准更保守（c* 更大）', opt2.cOpt > opt.cOpt,
  'c*(P(S)=.5)=' + opt.cOpt.toFixed(3) + ' → c*(P(S)=.2)=' + opt2.cOpt.toFixed(3));

/* ===================================================================== */
section('准确率悖论');
// 先验 P(S)=0.8、40 试次（32 信号 / 8 噪音），全程报"有目标" → 准确率恰好 0.8，
// 但这个策略完全没有用到任何信号信息。
const lazy = S.compute({ h: 32, m: 0, fa: 8, cr: 0 });
ok('先验 0.8 时一律报"有目标" → 准确率 0.80', near(lazy.accuracy, 0.8, 1e-9));
ok('该策略未使用信号信息（P(H)=P(FA)=1，触发校正）', lazy.corrected === true);
// 对照：同一先验下真正有辨别力的被试
const sens = S.compute({ h: 28, m: 4, fa: 3, cr: 5 });
ok('同先验下有辨别力者的准确率更高', sens.accuracy > lazy.accuracy,
  sens.accuracy.toFixed(3) + ' > ' + lazy.accuracy.toFixed(3));
ok('且有辨别力者的 d′ 明显大于 0', sens.dprime > 1, 'd′ = ' + sens.dprime.toFixed(3));

/* ===================================================================== */
section('刺激生成：目标频带能量应高于背景');
function bandMean(stim, center) {
  let sum = 0, n = 0;
  for (let c = 0; c < stim.timeBins; c++) {
    for (let dr = -1; dr <= 1; dr++) {
      const row = center + dr;
      if (row < 0 || row >= stim.freqBins) continue;
      sum += stim.data[c * stim.freqBins + row]; n++;
    }
  }
  return sum / n;
}
function offBandMean(stim, center) {
  let sum = 0, n = 0;
  for (let c = 0; c < stim.timeBins; c++) {
    for (let row = 0; row < stim.freqBins; row++) {
      if (Math.abs(row - center) <= 4) continue;
      sum += stim.data[c * stim.freqBins + row]; n++;
    }
  }
  return sum / n;
}
[0.6, 1.0, 1.5, 2.2, 3.0].forEach(function (d) {
  const rng = U.makeRng(20260927);
  let sig = 0, noi = 0, N = 60;
  for (let i = 0; i < N; i++) {
    const s = SDT.sonar.generateTrial({ rng: rng, isSignal: true, dprime: d });
    sig += bandMean(s, s.targetBin) / offBandMean(s, s.targetBin);
    const n = SDT.sonar.generateTrial({ rng: rng, isSignal: false, dprime: d });
    noi += bandMean(n, 30) / offBandMean(n, 30);
  }
  sig /= N; noi /= N;
  ok('d′=' + d.toFixed(1) + ' 信号试次频带更强', sig > noi,
    '信号 ' + sig.toFixed(3) + ' vs 噪音 ' + noi.toFixed(3));
});
ok('振幅随设计 d′ 单调递增',
  [0.6, 1.0, 1.5, 2.2, 3.0].every(function (d, i, arr) {
    return i === 0 || SDT.sonar.amplitudeForDprime(d) > SDT.sonar.amplitudeForDprime(arr[i - 1]);
  }));
const noSignal = SDT.sonar.generateTrial({ rng: U.makeRng(1), isSignal: false, dprime: 1.5 });
ok('噪音试次不设置目标频率', noSignal.targetBin === -1);
ok('矩阵尺寸为 64 × 32', noSignal.freqBins === 64 && noSignal.timeBins === 32);

/* ===================================================================== */
section('试次序列严格按先验概率配比');
[[0.5, 40, 20], [0.3, 40, 12], [0.8, 20, 16], [0.2, 50, 10], [0.7, 30, 21]].forEach(function (c) {
  const eng = new SDT.Engine({
    priorP: c[0], dprime: 1.5, trials: c[1], observeMs: 2000, feedback: false, seed: 7
  }, {});
  const nSig = eng.queue.filter(Boolean).length;
  ok('P(S)=' + c[0] + ' × ' + c[1] + ' 试次 → ' + c[2] + ' 个信号试次',
    nSig === c[2] && eng.queue.length === c[1], '实际 ' + nSig);
});
const engA = new SDT.Engine({ priorP: 0.5, dprime: 1.5, trials: 40, observeMs: 2000, feedback: false, seed: 1 }, {});
const engB = new SDT.Engine({ priorP: 0.5, dprime: 1.5, trials: 40, observeMs: 2000, feedback: false, seed: 2 }, {});
ok('不同随机种子给出不同的试次顺序',
  engA.queue.join('') !== engB.queue.join(''));

/* ===================================================================== */
section('summarize 汇总');
const trials = [];
for (let i = 0; i < 30; i++) {
  trials.push({ isSignal: i < 15, response: i % 3 === 2 ? 'noise' : 'signal', rt: 400 + i * 5 });
}
const sum = S.summarize(trials, { priorP: 0.5, dprime: 1.5, trials: 30, observeMs: 2000 });
ok('混淆矩阵四格之和 = 试次数',
  sum.counts.h + sum.counts.m + sum.counts.fa + sum.counts.cr === 30);
ok('每个试次都被打上 outcome 标记',
  trials.every(function (t) { return ['h', 'm', 'fa', 'cr'].indexOf(t.outcome) >= 0; }));
ok('meanRT 已计算', isFinite(sum.rtMean), Math.round(sum.rtMean) + ' ms');
ok('分结果 RT 已计算', isFinite(sum.rtByOutcome.hit));
ok('majorityBaseline / accuracyGain 已计算',
  isFinite(sum.majorityBaseline) && isFinite(sum.accuracyGain));
ok('trialList 已挂载', sum.trialList === trials);

/* ===================================================================== */
console.log('\n' + '─'.repeat(52));
console.log(failed === 0
  ? '全部 ' + passed + ' 项断言通过 ✅'
  : passed + ' 项通过，' + failed + ' 项失败 ❌');
process.exit(failed === 0 ? 0 : 1);
