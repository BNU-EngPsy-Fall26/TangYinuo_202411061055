/**
 * results.js —— 结果计算与展示
 * ---------------------------------------------------------------------------
 * 输入：SDT.sdt.summarize() 产出的本局统计量（含混淆矩阵、d′、c、β、A′、AUC、RT）
 * 输出：结果页的完整 DOM —— KPI 卡片、混淆矩阵、文字解读、双分布图、ROC、
 *       准确率悖论对照、逐试次明细表、多局对比表。
 *
 * 所有数值都来自 sdt.js 的计算，这里只负责"讲清楚它意味着什么"。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;
  const CFG = SDT.config;

  /** 依据 d′ 给出一句话解读 */
  function dprimeVerdict(dprime) {
    if (!isFinite(dprime)) return { text: '无法计算', tone: 'muted' };
    if (dprime < 0) return { text: '低于随机水平（疑似按键反了）', tone: 'bad' };
    if (dprime < 0.5) return { text: '几乎无法分辨信号与噪音', tone: 'bad' };
    if (dprime < 1.5) return { text: '辨别力偏弱', tone: 'warn' };
    if (dprime < 2.5) return { text: '辨别力中等', tone: 'ok' };
    if (dprime < 3.5) return { text: '辨别力良好', tone: 'good' };
    return { text: '辨别力很强', tone: 'good' };
  }

  function accuracyVerdict(gain) {
    if (!isFinite(gain)) return { text: '—', tone: 'muted' };
    if (gain < -0.005) return { text: '不如"永远报多数类"的偷懒策略', tone: 'bad' };
    if (gain < 0.05) return { text: '仅略高于偷懒基线', tone: 'warn' };
    if (gain < 0.2) return { text: '明显优于偷懒基线', tone: 'ok' };
    return { text: '远超偷懒基线', tone: 'good' };
  }

  /* =======================================================================
   * KPI 卡片
   * ===================================================================== */
  function renderKpis(root, stats) {
    const vd = dprimeVerdict(stats.dprime);
    const cl = CFG.criterionLabel(stats.c);
    const av = accuracyVerdict(stats.accuracyGain);

    const cards = [
      {
        key: 'd′',
        name: '辨别力 d′',
        value: isFinite(stats.dprime) ? stats.dprime.toFixed(2) : '∞',
        sub: vd.text,
        tone: vd.tone,
        note: '信号与噪音两个分布相距多少个标准差。本局设计值 d′=' + stats.meta.dprimeSet.toFixed(1)
      },
      {
        key: 'c',
        name: '判定标准 c',
        value: isFinite(stats.c) ? stats.c.toFixed(2) : '—',
        sub: cl.label + ' · ' + (stats.c > 0.05 ? '偏保守' : stats.c < -0.05 ? '偏宽松' : '接近中性'),
        tone: 'info',
        note: cl.desc
      },
      {
        key: 'β',
        name: '似然比判据 β',
        value: isFinite(stats.beta) ? stats.beta.toFixed(2) : '—',
        sub: stats.beta > 1 ? '需要较强证据才报"有目标"' : stats.beta < 1 ? '较弱证据就报"有目标"' : '证据无关，直接按先验猜',
        tone: 'info',
        note: 'β = exp(d′·c)，与 c 一一对应'
      },
      {
        key: 'acc',
        name: '总准确率',
        value: U.pct(stats.accuracy, 1),
        sub: av.text,
        tone: av.tone,
        note: '偷懒基线（永远报多数类）= ' + U.pct(stats.majorityBaseline, 1)
      },
      {
        key: 'pH',
        name: 'P(击中) / P(虚报)',
        value: U.pct(stats.pH, 0) + ' / ' + U.pct(stats.pFA, 0),
        sub: '击中 ' + stats.counts.h + ' 次，虚报 ' + stats.counts.fa + ' 次',
        tone: 'info',
        note: stats.corrected ? '已做对数线性校正' : '未触发校正'
      },
      {
        key: 'rt',
        name: '平均反应时',
        value: isFinite(stats.rtMean) ? (stats.rtMean / 1000).toFixed(2) + ' s' : '—',
        sub: '快 ≠ 好：先看 d′，再看 RT',
        tone: 'info',
        note: '从扫描结束、作答窗口打开起算'
      }
    ];

    root.innerHTML = cards.map(function (card) {
      return '' +
        '<div class="kpi kpi--' + card.tone + '">' +
        '<div class="kpi__key">' + U.escapeHtml(card.key) + '</div>' +
        '<div class="kpi__name">' + U.escapeHtml(card.name) + '</div>' +
        '<div class="kpi__value">' + U.escapeHtml(card.value) + '</div>' +
        '<div class="kpi__sub">' + U.escapeHtml(card.sub) + '</div>' +
        '<div class="kpi__note">' + U.escapeHtml(card.note) + '</div>' +
        '</div>';
    }).join('');
  }

  /* =======================================================================
   * 混淆矩阵
   * ===================================================================== */
  function renderMatrix(root, stats) {
    const S = CFG.SCENARIO;
    const c = stats.counts;
    const r = stats.rates;

    function cell(kind, count, rate, denom, label, sub) {
      const pct = isFinite(rate) ? U.pct(rate, 1) : '—';
      return '' +
        '<div class="mx__cell mx__cell--' + kind + '">' +
        '<div class="mx__label">' + label + '</div>' +
        '<div class="mx__count">' + count + '<span>次</span></div>' +
        '<div class="mx__rate">' + pct + ' <em>(' + count + '/' + denom + ')</em></div>' +
        '<div class="mx__sub">' + sub + '</div>' +
        '</div>';
    }

    root.innerHTML = '' +
      '<div class="mx">' +
      '<div class="mx__corner"><span>真实状态 →</span><span>你的回答 ↓</span></div>' +
      '<div class="mx__head mx__head--s">有目标 S<br><em>P(S)=' + U.pct(stats.meta.priorP, 0) + '</em></div>' +
      '<div class="mx__head mx__head--n">无目标 N<br><em>P(N)=' + U.pct(1 - stats.meta.priorP, 0) + '</em></div>' +

      '<div class="mx__rowhead">报「有目标」</div>' +
      cell('hit', c.h, r.pH, r.nS, '击中 H', S.outcomes.hit.consequence) +
      cell('fa', c.fa, r.pFA, r.nN, '误报 FA', S.outcomes.fa.consequence) +

      '<div class="mx__rowhead">报「无目标」</div>' +
      cell('miss', c.m, r.pM, r.nS, '漏报 M', S.outcomes.miss.consequence) +
      cell('cr', c.cr, r.pCR, r.nN, '正确排除 CR', S.outcomes.cr.consequence) +
      '</div>';
  }

  /* =======================================================================
   * 文字解读
   * ===================================================================== */
  function renderNarrative(root, stats) {
    const S = CFG.SCENARIO;
    const opt = SDT.sdt.optimalCriterion(stats.meta.dprimeSet, stats.meta.priorP, S.payoff);
    const cl = CFG.criterionLabel(stats.c);
    const parts = [];

    // 1) 一句话总评
    parts.push(
      '<p><strong>本局概况：</strong>共 ' + stats.n + ' 个试次（有目标 ' + stats.rates.nS +
      ' 次、无目标 ' + stats.rates.nN + ' 次），设定难度 d′=' + stats.meta.dprimeSet.toFixed(1) +
      '，你实测的辨别力 d′=' + U.fixed(stats.dprime, 2) + '。</p>'
    );

    // 2) 准确率悖论
    const lazy = stats.majorityBaseline;
    const lazyChoice = stats.rates.nN >= stats.rates.nS ? '无目标' : '有目标';
    parts.push(
      '<p><strong>为什么只报准确率是不够的？</strong>本局先验概率 P(S)=' +
      U.pct(stats.meta.priorP, 0) + '，如果你根本不看屏幕、' +
      '全程一律回答「' + lazyChoice + '」，准确率也有 <b>' + U.pct(lazy, 1) +
      '</b>。你的实际准确率是 <b>' + U.pct(stats.accuracy, 1) + '</b>，' +
      (stats.accuracyGain >= 0
        ? '比这个"偷懒基线"高出 <b>' + U.pct(stats.accuracyGain, 1) + '</b>。'
        : '<b>反而比它低了 ' + U.pct(-stats.accuracyGain, 1) + '</b>——说明你的判断策略在这一局里是有问题的。') +
      ' 单看准确率会把"只看先验就猜中"的运气算成能力；' +
      'd′ 才是真正把"辨别力"和"回答偏好"分开的指标。</p>'
    );

    // 3) 判定标准是否划算
    if (isFinite(opt.cOpt)) {
      const diff = stats.c - opt.cOpt;
      const judgement = Math.abs(diff) < 0.25
        ? '你的判定标准与最优标准几乎重合，这一局你在"代价权衡"上做得很准。'
        : diff > 0
          ? '你比最优标准更保守，报「有目标」的次数偏少——在本场景里漏报代价最高，偏保守会让你多付出一些代价。'
          : '你比最优标准更宽松，报「有目标」的次数偏多——在本场景里误报只是浪费资源，所以偏宽松的代价相对可控，但仍有优化空间。';
      parts.push(
        '<p><strong>你的判定标准划算吗？</strong>按本局先验 P(S)=' + U.pct(stats.meta.priorP, 0) +
        ' 与场景的支付矩阵（击中 +' + S.payoff.vH + '、正确排除 +' + S.payoff.vCR +
        '、误报 ' + S.payoff.vFA + '、漏报 ' + S.payoff.vM +
        '），理想观察者应把标准设在 <b>c* = ' + opt.cOpt.toFixed(2) +
        '</b>（对应 β* = ' + opt.betaOpt.toFixed(2) + '）；你的实际标准是 <b>c = ' +
        U.fixed(stats.c, 2) + '</b>（' + cl.label + '）。' + judgement + '</p>'
      );
    }

    // 4) 校正与诊断
    if (stats.warnings.length) {
      parts.push('<div class="note note--warn"><strong>需要注意：</strong><ul>' +
        stats.warnings.map(function (w) { return '<li>' + U.escapeHtml(w) + '</li>'; }).join('') +
        '</ul></div>');
    }
    if (stats.notes.length) {
      parts.push('<div class="note note--info"><ul>' +
        stats.notes.map(function (w) { return '<li>' + U.escapeHtml(w) + '</li>'; }).join('') +
        '</ul></div>');
    }

    // 5) 备选敏感性指标
    parts.push(
      '<p class="dim">附：非参数敏感性 <b>A′</b> = ' + U.fixed(stats.aPrime, 3) +
      '（不假设正态分布，0.5 表示无辨别力）；按等方差正态模型推算的 <b>AUC</b> = ' +
      U.fixed(stats.auc, 3) + '（0.5 即随机水平）。A′ 与 AUC 都随本局 d′ 单调变化，可与 d′ 相互佐证。</p>'
    );

    root.innerHTML = parts.join('');
  }

  /* =======================================================================
   * 图表
   * ===================================================================== */
  function renderCharts(stats, history) {
    const distCanvas = U.$('#distCanvas');
    const rocCanvas = U.$('#rocCanvas');
    const accCanvas = U.$('#accCanvas');

    if (distCanvas) {
      SDT.charts.drawDistributions(distCanvas, {
        dprime: Math.max(0, stats.dprime),
        c: isFinite(stats.c) ? stats.c : 0,
        labels: true
      });
      const cap = U.$('#distCaption');
      if (cap) {
        cap.innerHTML = '按本局<b>实测</b> d′ = ' + U.fixed(stats.dprime, 2) +
          '、c = ' + U.fixed(stats.c, 2) + ' 画出的等方差正态模型。' +
          '橙色阴影是虚报的概率 P(FA)，青色阴影是击中的概率 P(H)：' +
          '把判据向右移（更保守），两块阴影同时变小，但漏报会变多。';
      }
    }

    if (rocCanvas) {
      const curve = SDT.sdt.rocCurve(Math.max(0.05, stats.dprime), 240);
      const points = [{
        pFA: stats.pFA, pH: stats.pH,
        label: '本局 (' + U.fixed(stats.pFA, 2) + ', ' + U.fixed(stats.pH, 2) + ')',
        color: '#ff8a5c', size: 6
      }];
      // 多局对比：把历史各局的点也画上（最多最近 8 局）
      (history || []).slice(-8).forEach(function (h, i, arr) {
        if (h === stats) return;
        points.push({
          pFA: h.pFA, pH: h.pH,
          color: 'rgba(167,139,250,' + (0.35 + 0.5 * (i / Math.max(1, arr.length - 1))) + ')',
          size: 4.5
        });
      });
      SDT.charts.drawRoc(rocCanvas, {
        curve: curve,
        points: points,
        subtitle: '理论 ROC（d′ = ' + U.fixed(stats.dprime, 2) + '）· AUC = ' + U.fixed(stats.auc, 3)
      });
      const cap = U.$('#rocCaption');
      if (cap) {
        cap.innerHTML = '曲线是<b>理论 ROC</b>：固定辨别力 d′，把所有可能的判定标准 c 走一遍，' +
          '得到的一整条 (P(虚报), P(击中)) 轨迹。橙色点是你的本局表现，紫色点是历史各局。' +
          '曲线越靠近左上角，辨别力越强；同一条曲线上的不同位置，只是标准不同，辨别力并没有变。';
      }
    }

    if (accCanvas) {
      SDT.charts.drawBars(accCanvas, {
        max: 1,
        items: [
          { label: '你的准确率', value: stats.accuracy, color: '#3fdbd0' },
          { label: '偷懒基线', value: stats.majorityBaseline, color: 'rgba(243,181,68,0.85)' },
          { label: '本局先验 P(S)', value: stats.meta.priorP, color: 'rgba(120,180,205,0.55)' }
        ],
        note: '偷懒基线 = 完全不看屏幕、一律回答出现次数更多的那一类所能达到的准确率'
      });
    }
  }

  /* =======================================================================
   * 逐试次明细表
   * ===================================================================== */
  const OUTCOME_META = {
    h: { name: '击中', cls: 'hit' },
    m: { name: '漏报', cls: 'miss' },
    fa: { name: '误报', cls: 'fa' },
    cr: { name: '正确排除', cls: 'cr' }
  };

  function renderTrialTable(root, trials) {
    const rows = trials.map(function (t) {
      const meta = OUTCOME_META[t.outcome] || { name: '—', cls: '' };
      return '<tr>' +
        '<td>' + (t.index + 1) + '</td>' +
        '<td>' + (t.isSignal ? '<span class="tag tag--s">有目标</span>' : '<span class="tag tag--n">无目标</span>') + '</td>' +
        '<td>' + (t.response === 'signal' ? '报有' : '报无') + '</td>' +
        '<td><span class="tag tag--' + meta.cls + '">' + meta.name + '</span></td>' +
        '<td class="num">' + (isFinite(t.rt) ? (t.rt / 1000).toFixed(2) : '—') + '</td>' +
        '<td class="num">' + (t.stim.targetBin >= 0
          ? (SDT.sonar.FREQ_RANGE.min +
            (SDT.sonar.FREQ_RANGE.max - SDT.sonar.FREQ_RANGE.min) * (t.stim.targetBin / t.stim.freqBins)
          ).toFixed(2)
          : '—') + '</td>' +
        '<td>' + (t.stim.hasBurst ? '有' : '') + '</td>' +
        '</tr>';
    }).join('');
    root.innerHTML = rows;
  }

  /** 导出逐试次数据为 CSV */
  function exportCsv(trials, stats) {
    const head = ['试次', '真实状态', '你的回答', '结果', '反应时_ms', '目标频率_kHz', '是否含宽频爆发'];
    const lines = [head.join(',')];
    const F0 = SDT.sonar.FREQ_RANGE;
    trials.forEach(function (t) {
      const meta = OUTCOME_META[t.outcome] || { name: '' };
      lines.push([
        t.index + 1,
        t.isSignal ? 'S' : 'N',
        t.response === 'signal' ? 'Y' : 'N',
        meta.name,
        isFinite(t.rt) ? Math.round(t.rt) : '',
        t.stim.targetBin >= 0
          ? (F0.min + (F0.max - F0.min) * (t.stim.targetBin / t.stim.freqBins)).toFixed(3)
          : '',
        t.stim.hasBurst ? 1 : 0
      ].join(','));
    });
    lines.push('');
    lines.push('# 汇总');
    lines.push('# 先验P(S),' + stats.meta.priorP);
    lines.push('# 设定dprime,' + stats.meta.dprimeSet);
    lines.push('# 实测dprime,' + U.fixed(stats.dprime, 4));
    lines.push('# c,' + U.fixed(stats.c, 4));
    lines.push('# beta,' + U.fixed(stats.beta, 4));
    lines.push('# 准确率,' + U.fixed(stats.accuracy, 4));
    lines.push('# P(H),' + U.fixed(stats.pH, 4));
    lines.push('# P(FA),' + U.fixed(stats.pFA, 4));
    lines.push('# A_prime,' + U.fixed(stats.aPrime, 4));
    lines.push('# AUC,' + U.fixed(stats.auc, 4));
    lines.push('# 是否校正,' + (stats.corrected ? '是(对数线性)' : '否'));
    U.downloadText('sdt-sonar-trials-' + Date.now() + '.csv', lines.join('\n'), 'text/csv');
  }

  /* =======================================================================
   * 多局对比表
   * ===================================================================== */
  function renderHistory(root, history) {
    if (!history.length) {
      root.innerHTML = '<tr><td colspan="8" class="empty">还没有历史记录。换一组参数再跑一局，这里会出现对比。</td></tr>';
      return;
    }
    root.innerHTML = history.map(function (h, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + U.pct(h.meta.priorP, 0) + '</td>' +
        '<td class="num">' + h.meta.dprimeSet.toFixed(1) + '</td>' +
        '<td class="num">' + h.n + '</td>' +
        '<td class="num strong">' + U.fixed(h.dprime, 2) + '</td>' +
        '<td class="num">' + U.fixed(h.c, 2) + '</td>' +
        '<td class="num">' + U.fixed(h.beta, 2) + '</td>' +
        '<td class="num">' + U.pct(h.accuracy, 1) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* =======================================================================
   * 对外入口
   * ===================================================================== */
  function render(stats, history) {
    if (U.$('#kpiGrid')) renderKpis(U.$('#kpiGrid'), stats);
    if (U.$('#matrixGrid')) renderMatrix(U.$('#matrixGrid'), stats);
    if (U.$('#resultNarrative')) renderNarrative(U.$('#resultNarrative'), stats);
    if (U.$('#trialTableBody')) renderTrialTable(U.$('#trialTableBody'), stats.trialList || []);
    if (U.$('#historyTableBody')) renderHistory(U.$('#historyTableBody'), history || []);
    renderCharts(stats, history || []);
  }

  SDT.results = {
    render: render,
    exportCsv: exportCsv,
    renderHistory: renderHistory,
    dprimeVerdict: dprimeVerdict
  };
})(window);
