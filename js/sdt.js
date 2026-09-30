/**
 * sdt.js —— 信号检测论核心计算
 * ---------------------------------------------------------------------------
 * 本文件是整个网站的"裁判"：把混淆矩阵换算成全部 SDT 指标。
 * 采用的公式体系为等方差正态模型（Macmillan & Clearman, 2005）：
 *
 *   混淆矩阵                    信号（真实状态）
 *                       有目标(S)        无目标(N)
 *   回答「有」(Y)       击中 H(Hit)      误报 FA(False Alarm)
 *   回答「无」(N)       漏报 M(Miss)     正确排除 CR(Correct Rejection)
 *
 *   P(H)  = H / (H + M)          P(FA) = FA / (FA + CR)
 *   zH    = Φ⁻¹[P(H)]            zF    = Φ⁻¹[P(FA)]
 *   d′    = zH − zF              辨别力：两个分布均值之差（以标准差为单位）
 *   c     = −(zH + zF) / 2       判定标准：0 为中性，> 0 保守，< 0 宽松
 *   β     = exp(d′ · c) = exp[(zF² − zH²) / 2]   似然比判据
 *
 *   判定变量轴上的判据位置：  xc = c + d′ / 2
 *   （噪音分布 N(0,1)、信号分布 N(d′,1)）
 *
 *   准确率 = (H + CR) / N
 *   理论 AUC（等方差假设）= Φ(d′ / √2)
 *   非参数 A′（Grier, 1971）—— 不依赖正态假设的备选敏感性指标
 *
 *   当 P(H) = 1 或 P(FA) = 0 时，z 分数为无穷大；
 *   此时按对数线性法（Hautus, 1995）对四格各加 0.5 再计算，并给出提示。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;

  /* =======================================================================
   * 1. 由计数得到比率
   * ===================================================================== */
  function rates(counts) {
    const nS = counts.h + counts.m;   // 真实有目标的试次数
    const nN = counts.fa + counts.cr; // 真实无目标的试次数
    return {
      nS: nS,
      nN: nN,
      pH: nS > 0 ? counts.h / nS : NaN,    // P(击中)
      pM: nS > 0 ? counts.m / nS : NaN,    // P(漏报)
      pFA: nN > 0 ? counts.fa / nN : NaN,  // P(虚报)
      pCR: nN > 0 ? counts.cr / nN : NaN   // P(正确排除)
    };
  }

  /* =======================================================================
   * 2. 主计算入口
   * ===================================================================== */
  /**
   * @param {{h:number,m:number,fa:number,cr:number}} counts 混淆矩阵计数
   * @returns 全部 SDT 指标 + 提示信息
   */
  function compute(counts) {
    const r = rates(counts);
    const n = counts.h + counts.m + counts.fa + counts.cr;
    const warnings = [];
    const notes = [];

    // ---------- 对数线性校正 ----------
    let pH = r.pH, pFA = r.pFA;
    let corrected = false;
    const needCorrection = (pFA === 0 || pH === 1);

    if (needCorrection) {
      corrected = true;
      const h = counts.h + 0.5, m = counts.m + 0.5;
      const fa = counts.fa + 0.5, cr = counts.cr + 0.5;
      pH = h / (h + m);
      pFA = fa / (fa + cr);
      warnings.push(
        '本局出现了 P(击中) = 1 或 P(虚报) = 0，理论上 d′ 为无穷大。' +
        '已按对数线性法对四格各加 0.5 后再计算（Hautus, 1995），使指标保持有限。'
      );
    }

    // ---------- 核心指标 ----------
    const zH = U.normInv(pH);
    const zF = U.normInv(pFA);
    const dprime = zH - zF;
    const c = -(zH + zF) / 2;
    const beta = Math.exp(dprime * c);
    const criterionX = c + dprime / 2;   // 判定变量轴上的判据位置

    // ---------- 准确率 ----------
    const accuracy = n > 0 ? (counts.h + counts.cr) / n : NaN;

    // ---------- 非参数敏感性 A′（Grier, 1971） ----------
    let aPrime = NaN;
    if (pH >= pFA) {
      const denom = 4 * pH * (1 - pFA);
      if (denom > 0) aPrime = 0.5 + ((pH - pFA) * (1 + pH - pFA)) / denom;
    } else {
      const denom = 4 * pFA * (1 - pH);
      if (denom > 0) aPrime = 0.5 - ((pFA - pH) * (1 + pFA - pH)) / denom;
    }

    // ---------- 理论 AUC（等方差正态假设） ----------
    const auc = U.normCdf(dprime / Math.SQRT2);

    // ---------- 诊断提示 ----------
    if (n > 0 && r.nS === 0) warnings.push('本局没有任何"有目标"试次，无法计算 P(击中) 与 d′。');
    if (n > 0 && r.nN === 0) warnings.push('本局没有任何"无目标"试次，无法计算 P(虚报)。');
    if (isFinite(dprime) && dprime < 0) {
      warnings.push(
        'd′ < 0 表示敏感性低于随机水平：很可能把两个按键按反了，' +
        '或者"目标回波"与"噪声"的特征判断反了。'
      );
    }
    if (isFinite(c) && Math.abs(c) > 1.5) {
      notes.push(
        '本局的判定标准非常' + (c > 0 ? '保守' : '宽松') +
        '（|c| > 1.5），几乎没有使用另一侧的回答。可以对照本局先验概率，' +
        '看看这个标准是否划算。'
      );
    }

    // ---------- 混淆矩阵单元格明细（含比率），供界面直接遍历渲染 ----------
    const cellDetail = [
      { key: 'hit', code: 'H', label: '击中', count: counts.h, rate: r.pH, denom: r.nS, good: true },
      { key: 'miss', code: 'M', label: '漏报', count: counts.m, rate: r.pM, denom: r.nS, good: false },
      { key: 'fa', code: 'FA', label: '误报', count: counts.fa, rate: r.pFA, denom: r.nN, good: false },
      { key: 'cr', code: 'CR', label: '正确排除', count: counts.cr, rate: r.pCR, denom: r.nN, good: true }
    ];

    return {
      counts: counts,
      n: n,
      rates: r,
      corrected: corrected,
      pH: pH, pFA: pFA,          // 实际用于计算的值（可能已校正）
      rawPH: r.pH, rawPFA: r.pFA,
      zH: zH, zF: zF,
      dprime: dprime,
      c: c,
      beta: beta,
      criterionX: criterionX,
      accuracy: accuracy,
      aPrime: aPrime,
      auc: auc,
      cellDetail: cellDetail,
      warnings: warnings,
      notes: notes
    };
  }

  /* =======================================================================
   * 3. 由 d′ 与 c 反推两个概率（概念实验室与理论曲线使用）
   *    zH = d′/2 − c ,  zF = −d′/2 − c
   * ===================================================================== */
  function fromDprimeC(dprime, c) {
    const zH = dprime / 2 - c;
    const zF = -dprime / 2 - c;
    return {
      zH: zH, zF: zF,
      pH: U.normCdf(zH),
      pFA: U.normCdf(zF),
      accuracy: NaN  // 准确率还依赖先验概率，需另行计算
    };
  }

  /** 给定先验 P(S)，由 d′、c 算出期望准确率 */
  function expectedAccuracy(dprime, c, priorP) {
    const p = fromDprimeC(dprime, c);
    // 准确率 = P(S)·P(H) + P(N)·P(CR)
    return priorP * p.pH + (1 - priorP) * (1 - p.pFA);
  }

  /* =======================================================================
   * 4. 理论 ROC 曲线
   *    等方差正态模型下，ROC 由 (P(FA), P(H)) = (Φ(−d′/2 − c), Φ(d′/2 − c)) 给出
   * ===================================================================== */
  function rocCurve(dprime, steps) {
    const n = steps || 200;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      // c 从 +4 扫到 −4（保守 → 宽松）
      const c = 4 - (8 * i) / n;
      const p = fromDprimeC(dprime, c);
      pts.push({ pFA: p.pFA, pH: p.pH, c: c });
    }
    return pts;
  }

  /**
   * z 坐标 ROC（zROC）
   * 等方差模型下 zH = zF + d′，即一条斜率恒为 1 的直线，纵轴截距恰好等于 d′。
   * 这里直接按解析式给出坐标，避免走 Φ → Φ⁻¹ 往返在极端尾部放大数值误差。
   */
  function zRocCurve(dprime, steps) {
    const n = steps || 200;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const c = 4 - (8 * i) / n;
      pts.push({ zF: -dprime / 2 - c, zH: dprime / 2 - c, c: c });
    }
    return pts;
  }

  /* =======================================================================
   * 5. 最优判定标准（先验概率 + 支付矩阵）
   *    β_opt = [P(N)/P(S)] × [(V_CR − V_FA) / (V_H − V_M)]
   *    c_opt = ln(β_opt) / d′
   * ===================================================================== */
  function optimalCriterion(dprime, priorP, payoff) {
    const pS = U.clamp(priorP, 1e-6, 1 - 1e-6);
    const pN = 1 - pS;

    // 支付矩阵：V_H 击中收益、V_CR 正确排除收益、V_FA 误报收益（通常为负）、V_M 漏报收益（通常为负）
    const gain = payoff.vCR - payoff.vFA;
    const loss = payoff.vH - payoff.vM;

    let betaOpt = NaN, cOpt = NaN;
    if (loss !== 0) {
      betaOpt = (pN / pS) * (gain / loss);
      if (betaOpt > 0 && dprime > 1e-6) cOpt = Math.log(betaOpt) / dprime;
    }

    const expected = isFinite(cOpt) ? fromDprimeC(dprime, cOpt) : null;
    return {
      betaOpt: betaOpt,
      cOpt: cOpt,
      pH: expected ? expected.pH : NaN,
      pFA: expected ? expected.pFA : NaN,
      // 该标准下的期望准确率
      accuracy: expected ? pS * expected.pH + pN * (1 - expected.pFA) : NaN
    };
  }

  /* =======================================================================
   * 6. 会话（一局实验）汇总
   * ===================================================================== */
  /**
   * @param {Array} trials 逐试次记录，元素含 {isSignal:boolean, response:'signal'|'noise', rt:number}
   * @param {object} config 本局参数 {priorP, dprime, trials, observeMs}
   */
  function summarize(trials, config) {
    const counts = { h: 0, m: 0, fa: 0, cr: 0 };
    const rtBy = { h: [], m: [], fa: [], cr: [] };
    const rtAll = [];

    trials.forEach(function (t) {
      if (!t.response) return;
      let key;
      if (t.isSignal && t.response === 'signal') key = 'h';
      else if (t.isSignal && t.response === 'noise') key = 'm';
      else if (!t.isSignal && t.response === 'signal') key = 'fa';
      else key = 'cr';

      t.outcome = key;
      counts[key] += 1;
      if (isFinite(t.rt)) {
        rtBy[key].push(t.rt);
        rtAll.push(t.rt);
      }
    });

    const stats = compute(counts);
    const mean = function (a) {
      return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : NaN;
    };

    stats.rtMean = mean(rtAll);
    stats.rtByOutcome = {
      hit: mean(rtBy.h), miss: mean(rtBy.m), fa: mean(rtBy.fa), cr: mean(rtBy.cr)
    };
    stats.meta = {
      priorP: config.priorP,
      dprimeSet: config.dprime,
      trialsPlan: config.trials,
      trialsDone: trials.length,
      observeMs: config.observeMs,
      finishedAt: new Date()
    };

    // 多数类基线（永远回答"出现更频繁的那一类"所能达到的准确率）
    const nSignal = counts.h + counts.m;
    const nNoise = counts.fa + counts.cr;
    stats.majorityBaseline = stats.n > 0 ? Math.max(nSignal, nNoise) / stats.n : NaN;
    stats.accuracyGain = stats.accuracy - stats.majorityBaseline;

    // 保留逐试次原始记录，供结果页明细表与 CSV 导出使用
    stats.trialList = trials;

    return stats;
  }

  SDT.sdt = {
    rates, compute, fromDprimeC, expectedAccuracy,
    rocCurve, zRocCurve, optimalCriterion, summarize
  };
})(window);
