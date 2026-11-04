/* ============================================================
 * results.js —— 结果页：从被试级数据现场算效应量并渲染
 *
 * 数据来自 js/data.js（由 analysis/compute_effects.py 生成）。
 * 所有统计（均值、SD、配对 t、p、dz、95%CI）都在浏览器里现算，
 * 不预先写死任何数字——数据一更新，页面结论自动跟着变。
 * ============================================================ */

(function (global) {
  'use strict';

  var A = global.ALAB;
  var S = global.Stats;
  var el = A.el;

  /* ---------------- 取数工具 ---------------- */

  function allSubs() {
    var d = (global.ALAB_DATA && global.ALAB_DATA.submissions) || [];
    // 同一被试同一实验只保留最后一次提交
    var map = {};
    d.forEach(function (s) {
      map[s.participant + '|' + s.experiment] = s;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function subsOf(expId) {
    return allSubs().filter(function (s) { return s.experiment === expId; });
  }

  function finite(a) {
    return a.filter(function (x) { return typeof x === 'number' && isFinite(x); });
  }

  function msd(a) {
    var v = finite(a);
    if (!v.length) return '—';
    if (v.length === 1) return S.mean(v).toFixed(0);
    return S.mean(v).toFixed(0) + ' ± ' + S.sd(v).toFixed(0);
  }

  /** 安全格式化：非数值一律显示破折号，避免页面出现 NaN */
  function n(x, digits, suffix) {
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    return x.toFixed(digits === undefined ? 2 : digits) + (suffix || '');
  }

  /** 效应量单元格：d + 显著性标记 */
  function dCell(d) {
    if (d === null || d === undefined || !isFinite(d)) return '—';
    var stars = Math.abs(d) >= 0.8 ? '***' : Math.abs(d) >= 0.5 ? '**' : Math.abs(d) >= 0.2 ? '*' : '';
    return d.toFixed(2) + (stars ? ' ' + stars : '');
  }

  function verdictChip(ok, text) {
    var cls = ok === true ? 'ok' : ok === false ? 'bad' : 'mid';
    return '<span class="chip ' + cls + '">' + text + '</span>';
  }

  /**
   * 判定色块：同时考虑方向与显著性。
   * @param {object} t    配对 t 结果（含 meanDiff / p）
   * @param {string} pos  方向符合预期时的文字
   * @param {string} neg  方向不符合预期时的文字
   * @param {number} sign +1 表示差值为正支持预测，-1 表示差值为负支持预测
   */
  function chipFor(t, pos, neg, sign) {
    if (!t) return '<span class="chip">—</span>';
    var ok = sign > 0 ? t.meanDiff > 0 : t.meanDiff < 0;
    var sig = t.p < 0.05;
    var cls = ok ? (sig ? 'ok' : 'mid') : (sig ? 'bad' : 'mid');
    var text = (ok ? pos : neg) + (sig ? '' : '·未显著');
    return '<span class="chip ' + cls + '">' + text + '</span>';
  }

  function table(headers, rows) {
    var html = '<div class="tbl-wrap"><table class="tbl"><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + h + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr>';
      r.forEach(function (c, i) {
        html += '<td' + (i > 0 ? ' class="num"' : '') + '>' + c + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  /** 简易横向条形图（SVG 字符串） */
  function barChart(items, unit) {
    var w = 640, rowH = 34, pad = 8;
    var max = 0;
    items.forEach(function (i) {
      if (typeof i.value === 'number' && isFinite(i.value)) max = Math.max(max, i.value);
    });
    if (!max) max = 1;
    var h = items.length * rowH + pad * 2;
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="max-width:640px;display:block;margin:10px auto" role="img">';
    items.forEach(function (it, i) {
      var y = pad + i * rowH;
      var val = (typeof it.value === 'number' && isFinite(it.value)) ? it.value : 0;
      var bw = Math.max(2, (val / max) * (w - 260));
      s += '<text x="0" y="' + (y + 18) + '" font-size="12.5" fill="#3c4a5a">' + it.label + '</text>';
      s += '<rect x="180" y="' + (y + 6) + '" width="' + bw + '" height="18" rx="4" fill="' + (it.color || '#2f6fed') + '"/>';
      s += '<text x="' + (186 + bw) + '" y="' + (y + 19) + '" font-size="12" fill="#16202c">' +
           n(it.value, it.digits === undefined ? 0 : it.digits) + (unit || '') + '</text>';
    });
    s += '</svg>';
    return s;
  }

  /* ============================================================
   * 实验一：闪烁变化盲
   * ========================================================== */

  function cbPerSub(trials) {
    var out = {};
    ['inset', 'outset'].forEach(function (c) {
      var ts = trials.filter(function (t) { return t.cond === c; });
      var ok = ts.filter(function (t) { return t.correct && typeof t.rt === 'number'; });
      out[c + '_rt'] = ok.length ? S.mean(ok.map(function (t) { return t.rt; })) : NaN;
      out[c + '_acc'] = ts.length ? ts.filter(function (t) { return t.correct; }).length / ts.length : NaN;
      out[c + '_n'] = ts.length;
    });
    return out;
  }

  function renderCB() {
    var subs = subsOf('cb');
    if (!subs.length) return null;

    var rows = subs.map(function (s) {
      return Object.assign({ pid: s.participant }, cbPerSub(s.trials));
    });
    var valid = rows.filter(function (r) {
      return isFinite(r.inset_rt) && isFinite(r.outset_rt);
    });

    var insetRT = valid.map(function (r) { return r.inset_rt; });
    var outsetRT = valid.map(function (r) { return r.outset_rt; });
    var insetAcc = valid.map(function (r) { return r.inset_acc; });
    var outsetAcc = valid.map(function (r) { return r.outset_acc; });

    var tRT = insetRT.length >= 2 ? S.pairedT(insetRT, outsetRT) : null;
    var tAcc = insetAcc.length >= 2 ? S.pairedT(insetAcc, outsetAcc) : null;

    var html = '<h2>实验一 · 闪烁变化盲（W5）</h2>' +
      '<p class="dim">Rensink, O\'Regan &amp; Clark (1997) · 改进条件：变化位置 = 目标色（蓝）/ 非目标色</p>';

    html += '<div class="kpis">' +
      '<div class="kpi"><div class="v">' + valid.length + '</div><div class="l">有效被试（n）</div></div>' +
      '<div class="kpi"><div class="v">' + (tRT ? A.fmt(tRT.dz) : '—') + '</div><div class="l">RT 效应量 dz</div></div>' +
      '<div class="kpi"><div class="v">' + (tRT ? S.fmtP(tRT.p) : '—') + '</div><div class="l">配对 t 检验 p</div></div>' +
      '</div>';

    html += barChart([
      { label: '目标色变化（蓝）', value: S.mean(insetRT), color: '#2f6fed' },
      { label: '非目标色变化', value: S.mean(outsetRT), color: '#8a97a8' }
    ], ' ms');

    html += table(
      ['指标', '目标色（蓝）M ± SD', '非目标色 M ± SD', '差值', 'dz', 't（df）', 'p'],
      [[
        '检测 RT（ms）',
        msd(insetRT),
        msd(outsetRT),
        tRT ? (tRT.meanDiff > 0 ? '+' : '') + tRT.meanDiff.toFixed(0) : '—',
        dCell(tRT && tRT.dz),
        tRT ? tRT.t.toFixed(2) + '（' + tRT.df + '）' : '—',
        tRT ? S.fmtP(tRT.p) : '—'
      ], [
        '正确率',
        n(S.mean(insetAcc) * 100, 0, '%'),
        n(S.mean(outsetAcc) * 100, 0, '%'),
        tAcc ? (tAcc.meanDiff * 100 > 0 ? '+' : '') + (tAcc.meanDiff * 100).toFixed(1) + ' pp' : '—',
        dCell(tAcc && tAcc.dz),
        tAcc ? tAcc.t.toFixed(2) + '（' + tAcc.df + '）' : '—',
        tAcc ? S.fmtP(tAcc.p) : '—'
      ]]
    );

    if (tRT) {
      var supported = tRT.meanDiff > 0;
      var sigRT = tRT.p < 0.05;
      html += '<p>' + verdictChip(supported, supported ? '预测方向成立' : '预测方向不成立') +
        (sigRT ? '' : verdictChip(false, '统计上未达显著')) +
        '　目标色变化的检测 ' + (supported ? '更快' : '没有更快') +
        '（非目标色 − 目标色 = ' + tRT.meanDiff.toFixed(0) + ' ms，95% CI [' +
        tRT.ci[0].toFixed(0) + ', ' + tRT.ci[1].toFixed(0) + ']，p ' + S.fmtP(tRT.p) + '）。</p>';
      if (valid.length < 8) {
        html += '<p class="dim small">n = ' + valid.length + '，统计检验力有限，结论以效应量方向为主。</p>';
      }
    } else {
      html += '<p class="dim">有效被试不足 2 人，暂无法做推断统计。</p>';
    }

    html += '<h3>与原研究对照</h3>' +
      '<p class="small">Rensink 等（1997）证明：在没有注意参与时，即使画面中的变化很大也很难被发现（变化盲）。' +
      '本研究把这个结论往"注意集"方向推了一步——参照 Most 等（2001）的注意定势研究，' +
      '与当前注意目标一致的物体，其变化应当更容易被捕捉。' +
      '如果上表的差值为正，说明注意集确实起到了"门控"作用，而不只是"有没有注意"这么粗的区分。</p>';

    html += '<h3>被试明细（匿名编号）</h3>' +
      table(['编号', '目标色 RT', '非目标色 RT', '目标色正确率', '非目标色正确率', '试次数'],
        rows.map(function (r) {
          return [
            r.pid,
            isFinite(r.inset_rt) ? r.inset_rt.toFixed(0) : '—',
            isFinite(r.outset_rt) ? r.outset_rt.toFixed(0) : '—',
            isFinite(r.inset_acc) ? (r.inset_acc * 100).toFixed(0) + '%' : '—',
            isFinite(r.outset_acc) ? (r.outset_acc * 100).toFixed(0) + '%' : '—',
            (r.inset_n + r.outset_n)
          ];
        }));

    return { html: html, supported: tRT ? tRT.meanDiff > 0 : null, p: tRT ? tRT.p : null };
  }

  /* ============================================================
   * 实验二：低流行率搜索
   * ========================================================== */

  function sdStats(trials) {
    var out = {};
    ['high', 'low', 'lowfb'].forEach(function (c) {
      var ts = trials.filter(function (t) { return t.cond === c; });
      var pres = ts.filter(function (t) { return t.present === 1; });
      var abs = ts.filter(function (t) { return t.present === 0; });
      var hit = pres.filter(function (t) { return t.resp === 'yes'; }).length;
      var fa = abs.filter(function (t) { return t.resp === 'yes'; }).length;

      // log-linear 校正，避免 0/1 导致 d' 无穷
      var hRate = (hit + 0.5) / (pres.length + 1);
      var fRate = (fa + 0.5) / (abs.length + 1);

      out[c + '_miss'] = pres.length ? 1 - hit / pres.length : NaN;
      out[c + '_fa'] = abs.length ? fa / abs.length : NaN;
      out[c + '_d'] = S.normInv(hRate) - S.normInv(fRate);
      out[c + '_c'] = -0.5 * (S.normInv(hRate) + S.normInv(fRate));
      out[c + '_n'] = ts.length;
      out[c + '_nPres'] = pres.length;
    });
    return out;
  }

  function renderLP() {
    var subs = subsOf('lp');
    if (!subs.length) return null;

    var rows = subs.map(function (s) {
      return Object.assign({ pid: s.participant }, sdStats(s.trials));
    });

    var miss = { high: [], low: [], lowfb: [] };
    var cc = { high: [], low: [], lowfb: [] };
    var dp = { high: [], low: [], lowfb: [] };
    rows.forEach(function (r) {
      ['high', 'low', 'lowfb'].forEach(function (c) {
        if (isFinite(r[c + '_miss'])) miss[c].push(r[c + '_miss']);
        if (isFinite(r[c + '_c'])) cc[c].push(r[c + '_c']);
        if (isFinite(r[c + '_d'])) dp[c].push(r[c + '_d']);
      });
    });

    var tPrev = miss.high.length >= 2 ? S.pairedT(miss.high, miss.low) : null;      // low - high
    var tFB = miss.low.length >= 2 ? S.pairedT(miss.low, miss.lowfb) : null;        // lowfb - low
    var tC = cc.low.length >= 2 ? S.pairedT(cc.low, cc.lowfb) : null;               // c: lowfb - low
    var tD = dp.high.length >= 2 ? S.pairedT(dp.high, dp.low) : null;

    var html = '<h2>实验二 · 低流行率视觉搜索（W6）</h2>' +
      '<p class="dim">Wolfe, Horowitz &amp; Kenner (2005) · 改进条件：低流行率 + 即时反馈（虚拟目标）</p>';

    html += '<div class="kpis">' +
      '<div class="kpi"><div class="v">' + rows.length + '</div><div class="l">有效被试（n）</div></div>' +
      '<div class="kpi"><div class="v">' + (tPrev ? A.fmt(tPrev.dz) : '—') + '</div><div class="l">低流行率效应 dz</div></div>' +
      '<div class="kpi"><div class="v">' + (tFB ? A.fmt(tFB.dz) : '—') + '</div><div class="l">反馈改善 dz</div></div>' +
      '</div>';

    html += table(
      ['条件', '目标出现率', '漏报率 M ± SD', '虚报率', "d'", '标准 c', '试次/人'],
      ['high', 'low', 'lowfb'].map(function (c) {
        return [
          c === 'high' ? '高流行率' : c === 'low' ? '低流行率' : '低流行率 + 反馈',
          c === 'high' ? '50%' : '10%',
          n(S.mean(miss[c]) * 100, 1, '%') + ' ± ' + n(S.sd(miss[c]) * 100, 1),
          n(S.mean(rows.map(function (r) { return r[c + '_fa']; })) * 100, 1, '%'),
          n(S.mean(dp[c]), 2),
          n(S.mean(cc[c]), 2),
          30
        ];
      })
    );

    html += table(
      ['检验', '比较', '差值', 'dz', 't（df）', 'p', '结论'],
      [
        [
          '复现：低流行率效应',
          'low − high（漏报率）',
          tPrev ? (tPrev.meanDiff * 100).toFixed(1) + ' pp' : '—',
          dCell(tPrev && tPrev.dz),
          tPrev ? tPrev.t.toFixed(2) + '（' + tPrev.df + '）' : '—',
          tPrev ? S.fmtP(tPrev.p) : '—',
          chipFor(tPrev, '复现成功', '未复现', +1)
        ],
        [
          '改进：反馈降低漏报',
          'lowfb − low（漏报率）',
          tFB ? (tFB.meanDiff * 100).toFixed(1) + ' pp' : '—',
          dCell(tFB && tFB.dz),
          tFB ? tFB.t.toFixed(2) + '（' + tFB.df + '）' : '—',
          tFB ? S.fmtP(tFB.p) : '—',
          chipFor(tFB, '支持预测', '未支持', -1)
        ],
        [
          '改进：反馈放宽标准 c',
          'lowfb − low（c）',
          tC ? tC.meanDiff.toFixed(2) : '—',
          dCell(tC && tC.dz),
          tC ? tC.t.toFixed(2) + '（' + tC.df + '）' : '—',
          tC ? S.fmtP(tC.p) : '—',
          chipFor(tC, '标准变宽松', '未变宽松', -1)
        ]
      ]
    );

    html += '<h3>与原研究对照</h3>' +
      '<p class="small">Wolfe 等（2005）报告：目标出现率从 50% 降到 1%–2% 时，漏报率大幅上升，' +
      '而且<b>即使明确告知目标可能出现、并给予高额奖励，漏报依然存在</b>——他们把原因归于判断标准（c）的漂移，' +
      '而非单纯的知觉失败。本研究用"每试次即时反馈"直接操作这个解释：' +
      '如果漏报主要来自标准漂移，反馈应当压低漏报率、把 c 拉回 0 附近；' +
      '若反馈无效，则说明低流行率效应更接近知觉层面的限制。</p>' +
      '<p class="small dim">注：本研究把流行率设为 10%（而非原文的 1%–2%），是为了在 30 试次内保留足够的目标试次；' +
      '代价是效应量会比原文小，这是设计上的取舍。</p>';

    html += '<h3>被试明细（匿名编号）</h3>' +
      table(['编号', 'high 漏报', 'low 漏报', 'lowfb 漏报', "high d'", "low d'", "lowfb d'", '试次数'],
        rows.map(function (r) {
          return [
            r.pid,
            isFinite(r.high_miss) ? (r.high_miss * 100).toFixed(0) + '%' : '—',
            isFinite(r.low_miss) ? (r.low_miss * 100).toFixed(0) + '%' : '—',
            isFinite(r.lowfb_miss) ? (r.lowfb_miss * 100).toFixed(0) + '%' : '—',
            isFinite(r.high_d) ? r.high_d.toFixed(2) : '—',
            isFinite(r.low_d) ? r.low_d.toFixed(2) : '—',
            isFinite(r.lowfb_d) ? r.lowfb_d.toFixed(2) : '—',
            (r.high_n + r.low_n + r.lowfb_n)
          ];
        }));

    return { html: html, supported: tFB ? tFB.meanDiff < 0 : null, p: tFB ? tFB.p : null };
  }

  /* ============================================================
   * 实验三：比例判断
   * ========================================================== */

  function cmPerSub(trials) {
    var out = {};
    ['bar_noticks', 'bar_ticks', 'pie_noticks', 'pie_ticks'].forEach(function (c) {
      var ts = trials.filter(function (t) { return t.cond === c; });
      out[c] = ts.length ? S.mean(ts.map(function (t) { return Math.abs(t.errSigned); })) : NaN;
      out[c + '_n'] = ts.length;
    });
    return out;
  }

  function renderCM() {
    var subs = subsOf('cm');
    if (!subs.length) return null;

    var rows = subs.map(function (s) {
      return Object.assign({ pid: s.participant }, cmPerSub(s.trials));
    });

    function col(k) { return finite(rows.map(function (r) { return r[k]; })); }

    var barNT = col('bar_noticks'), barT = col('bar_ticks'),
        pieNT = col('pie_noticks'), pieT = col('pie_ticks');

    var tFormat = barNT.length >= 2 ? S.pairedT(barNT, pieNT) : null;              // pie - bar

    // 刻度线整体效应：把所有"有刻度"与"无刻度"配对平均
    var noT = finite(rows.map(function (r) {
      return (r.bar_noticks + r.pie_noticks) / 2;
    }));
    var withT = finite(rows.map(function (r) {
      return (r.bar_ticks + r.pie_ticks) / 2;
    }));
    var tTickAll = noT.length >= 2 ? S.pairedT(noT, withT) : null;                // ticks - noticks（应为负）

    // 交互：饼图的改善量 vs 条形图的改善量
    var dBar = finite(rows.map(function (r) { return r.bar_noticks - r.bar_ticks; }));
    var dPie = finite(rows.map(function (r) { return r.pie_noticks - r.pie_ticks; }));
    var tInter = dBar.length >= 2 ? S.pairedT(dBar, dPie) : null;

    var html = '<h2>实验三 · 比例判断（W7）</h2>' +
      '<p class="dim">Cleveland &amp; McGill (1984) / Hollands &amp; Dyre (2000) · 改进条件：.25/.50/.75 刻度线</p>';

    html += '<div class="kpis">' +
      '<div class="kpi"><div class="v">' + rows.length + '</div><div class="l">有效被试（n）</div></div>' +
      '<div class="kpi"><div class="v">' + (tFormat ? A.fmt(tFormat.dz) : '—') + '</div><div class="l">图形差异 dz</div></div>' +
      '<div class="kpi"><div class="v">' + (tTickAll ? A.fmt(tTickAll.dz) : '—') + '</div><div class="l">刻度线效应 dz</div></div>' +
      '</div>';

    html += barChart([
      { label: '条形图 · 无刻度', value: S.mean(barNT), color: '#8a97a8', digits: 1 },
      { label: '条形图 · 有刻度', value: S.mean(barT), color: '#2f6fed', digits: 1 },
      { label: '饼图 · 无刻度', value: S.mean(pieNT), color: '#c2a06a', digits: 1 },
      { label: '饼图 · 有刻度', value: S.mean(pieT), color: '#b8860b', digits: 1 }
    ], ' pp');

    html += table(
      ['条件', '平均绝对误差（百分点）M ± SD', '试次/人'],
      [
        ['条形图 · 无刻度', n(S.mean(barNT), 1) + ' ± ' + n(S.sd(barNT), 1), 10],
        ['条形图 · 有刻度', n(S.mean(barT), 1) + ' ± ' + n(S.sd(barT), 1), 10],
        ['饼图 · 无刻度', n(S.mean(pieNT), 1) + ' ± ' + n(S.sd(pieNT), 1), 10],
        ['饼图 · 有刻度', n(S.mean(pieT), 1) + ' ± ' + n(S.sd(pieT), 1), 10]
      ]
    );

    html += table(
      ['检验', '比较', '差值', 'dz', 't（df）', 'p', '结论'],
      [
        [
          '复现：饼图更差',
          '饼 − 条（无刻度）',
          tFormat ? tFormat.meanDiff.toFixed(1) + ' pp' : '—',
          dCell(tFormat && tFormat.dz),
          tFormat ? tFormat.t.toFixed(2) + '（' + tFormat.df + '）' : '—',
          tFormat ? S.fmtP(tFormat.p) : '—',
          chipFor(tFormat, '复现成功', '未复现', +1)
        ],
        [
          '改进：刻度线降误差',
          '有刻度 − 无刻度',
          tTickAll ? tTickAll.meanDiff.toFixed(1) + ' pp' : '—',
          dCell(tTickAll && tTickAll.dz),
          tTickAll ? tTickAll.t.toFixed(2) + '（' + tTickAll.df + '）' : '—',
          tTickAll ? S.fmtP(tTickAll.p) : '—',
          chipFor(tTickAll, '支持预测', '未支持', -1)
        ],
        [
          '交互：饼图受益更大',
          'Δ饼 − Δ条',
          tInter ? tInter.meanDiff.toFixed(1) + ' pp' : '—',
          dCell(tInter && tInter.dz),
          tInter ? tInter.t.toFixed(2) + '（' + tInter.df + '）' : '—',
          tInter ? S.fmtP(tInter.p) : '—',
          chipFor(tInter, '交互成立', '交互不成立', +1)
        ]
      ]
    );

    html += '<h3>与原研究对照</h3>' +
      '<p class="small">Cleveland 与 McGill（1984）的经典结论是"位置与长度比角度与面积更容易读"，' +
      '因此饼图的判断误差通常大于条形图；Hollands 与 Dyre（2000）把误差来源归于锚点/参照不足。' +
      '本研究的 2×2 设计同时检验这两条：如果饼图的劣势（第一行）存在，说明复现成功；' +
      '如果刻度线整体降低误差（第二行），说明锚点确实有用；' +
      '如果饼图从刻度线中受益更多（第三行），就说明"锚点假说"对角度编码图形尤其关键。</p>';

    html += '<h3>被试明细（匿名编号）</h3>' +
      table(['编号', '条·无', '条·有', '饼·无', '饼·有', '试次数'],
        rows.map(function (r) {
          return [
            r.pid,
            isFinite(r.bar_noticks) ? r.bar_noticks.toFixed(1) : '—',
            isFinite(r.bar_ticks) ? r.bar_ticks.toFixed(1) : '—',
            isFinite(r.pie_noticks) ? r.pie_noticks.toFixed(1) : '—',
            isFinite(r.pie_ticks) ? r.pie_ticks.toFixed(1) : '—',
            (r.bar_noticks_n + r.bar_ticks_n + r.pie_noticks_n + r.pie_ticks_n)
          ];
        }));

    return { html: html, supported: tTickAll ? tTickAll.meanDiff < 0 : null, p: tTickAll ? tTickAll.p : null };
  }

  /* ============================================================
   * 主渲染
   * ========================================================== */

  function render(view) {
    var data = global.ALAB_DATA || { submissions: [] };
    var subs = allSubs();

    var html = '<h1>结果</h1><div class="rule"></div>';

    if (!subs.length) {
      view.innerHTML = html +
        '<div class="empty">' +
        '<p style="font-size:15px;color:#16202c;margin-top:0"><b>还没有被试数据</b></p>' +
        '<p class="small">收完数后按这个顺序更新：</p>' +
        '<p class="small" style="text-align:left;max-width:520px;margin:0 auto">' +
        '① 在注意实验室 /hw2 后台下载 CSV / JSON<br>' +
        '② 运行 <code>python analysis/compute_effects.py --in 导出文件 --out js/data.js</code><br>' +
        '③ 刷新本页，所有统计会自动重算</p>' +
        '</div>';
      return;
    }

    var counts = { cb: subsOf('cb').length, lp: subsOf('lp').length, cm: subsOf('cm').length };
    var pids = {};
    subs.forEach(function (s) { pids[s.participant] = 1; });

    html += '<p class="lede">所有指标均由 <code>js/data.js</code> 的试次级原始数据在浏览器中现场计算；' +
      '数据一更新，结论自动跟着变。</p>';

    html += '<div class="kpis">' +
      '<div class="kpi"><div class="v">' + Object.keys(pids).length + '</div><div class="l">独立被试数</div></div>' +
      '<div class="kpi"><div class="v">' + subs.length + '</div><div class="l">有效提交数</div></div>' +
      '<div class="kpi"><div class="v">' + counts.cb + ' / ' + counts.lp + ' / ' + counts.cm +
      '</div><div class="l">三实验人数</div></div>' +
      '<div class="kpi"><div class="v">' + (data.collectedAt ? data.collectedAt.slice(0, 10) : '—') +
      '</div><div class="l">数据更新日期</div></div>' +
      '</div>';

    if (data.collectedAt) {
      html += '<p class="dim small">数据生成于 ' + data.collectedAt +
        (data.source ? '，来源：' + data.source : '') + '</p>';
    }

    var results = [renderCB(), renderLP(), renderCM()];

    results.forEach(function (r) {
      if (r) html += '<div style="margin-top:38px">' + r.html + '</div>';
    });

    /* ---- 预测核对总表 ---- */
    function sumRow(label, pred, r) {
      if (!r) return [label, pred, '无数据', '<span class="chip">—</span>'];
      var sig = typeof r.p === 'number' && isFinite(r.p) && r.p < 0.05;
      var cls = r.supported ? (sig ? 'ok' : 'mid') : (sig ? 'bad' : 'mid');
      var txt = r.supported ? (sig ? '支持' : '方向一致·未显著')
                            : (sig ? '显著相反' : '方向相反·未显著');
      return [label, pred, r.supported ? '方向一致' : '方向相反',
              '<span class="chip ' + cls + '">' + txt + '</span>'];
    }

    html += '<h2>预测核对汇总</h2>' +
      '<p class="small dim">预测在收数前写入 README 并提交，此处对照实际结果。' +
      '「未显著」不代表预测错误，只代表在现有样本量下还不足以排除随机波动。</p>' +
      table(['实验', '核心预测', '结果', '判定'],
        [
          sumRow('变化盲', '目标色变化的检测快于非目标色', results[0]),
          sumRow('低流行率', '反馈降低漏报（改进生效）', results[1]),
          sumRow('比例判断', '刻度线降低判断误差（改进生效）', results[2])
        ]);

    html += '<p class="dim small" style="margin-top:22px">' +
      '统计口径：配对 t 检验（双尾），效应量报告 Cohen\'s dz；' +
      'd\' 与 c 采用 log-linear 校正。n &lt; 8 时不做过度解读，以效应量方向为准。</p>';

    view.innerHTML = html;
  }

  global.ALAB_RESULTS = { render: render };
})(window);
