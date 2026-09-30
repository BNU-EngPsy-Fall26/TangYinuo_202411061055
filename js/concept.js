/**
 * concept.js —— 概念实验室（交互式概念可视化）
 * ---------------------------------------------------------------------------
 * 这是加分项"交互式概念可视化"的实现：把 SDT 的核心概念做成可以动手拖的模型。
 *
 *   1. 双分布与判定标准：拖动 d′ 滑块看两个分布如何分开；拖动 c 滑块看判据如何左右移动，
 *      阴影面积（P(击中)、P(虚报)）实时变化 —— 直观回答"d′ 和 c 到底在动什么"。
 *   2. ROC / z-ROC：固定 d′，判据 c 在整条曲线上滑动；切到 z-ROC 可以看到等方差模型下
 *      它变成一条斜率 1 的直线。
 *   3. 最优判据：根据先验概率 P(S) 与支付矩阵算出 β*、c*，并在图上用紫色虚线标出。
 *   4. 准确率悖论：直观展示"不看屏幕也能有高准确率"的情形，说明为什么必须看 d′。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;
  const CFG = SDT.config;

  /** 当前控件状态 */
  const state = {
    dprime: 1.5,
    c: 0,
    priorP: 0.5,
    payoff: Object.assign({}, CFG.SCENARIO.payoff),
    showOptimal: true,
    zRoc: false
  };

  function readControls() {
    state.dprime = parseFloat(U.$('#cDp').value);
    state.c = parseFloat(U.$('#cC').value);
    state.priorP = parseFloat(U.$('#cPrior').value);
    state.payoff = {
      vH: parseFloat(U.$('#payVH').value) || 0,
      vCR: parseFloat(U.$('#payVCR').value) || 0,
      vFA: parseFloat(U.$('#payVFA').value) || 0,
      vM: parseFloat(U.$('#payVM').value) || 0
    };
    state.showOptimal = U.$('#chkOptimal').checked;
    state.zRoc = U.$('#chkZRoc').checked;
  }

  function syncLabels() {
    U.$('#cDpVal').textContent = state.dprime.toFixed(1);
    U.$('#cCVal').textContent = state.c.toFixed(2);
    U.$('#cPriorVal').textContent = U.pct(state.priorP, 0);
  }

  /* =======================================================================
   * 刷新全部输出
   * ===================================================================== */
  function refresh() {
    readControls();
    syncLabels();

    const info = SDT.sdt.fromDprimeC(state.dprime, state.c);
    const opt = SDT.sdt.optimalCriterion(state.dprime, state.priorP, state.payoff);
    const beta = Math.exp(state.dprime * state.c);
    const acc = state.priorP * info.pH + (1 - state.priorP) * (1 - info.pFA);

    /* ---- 1. 双分布图 ---- */
    const distCanvas = U.$('#conceptDistCanvas');
    if (distCanvas) {
      SDT.charts.drawDistributions(distCanvas, {
        dprime: state.dprime,
        c: state.c,
        cOpt: state.showOptimal ? opt.cOpt : NaN,
        labels: true
      });
    }

    /* ---- 2. ROC / z-ROC ---- */
    const rocCanvas = U.$('#conceptRocCanvas');
    if (rocCanvas) {
      if (state.zRoc) {
        // z 坐标 ROC：等方差模型下应为斜率 1 的直线，纵轴截距 = d′
        drawZRoc(rocCanvas, state.dprime, state.c, state.showOptimal ? opt.cOpt : NaN);
      } else {
        const curve = SDT.sdt.rocCurve(state.dprime, 200);
        SDT.charts.drawRoc(rocCanvas, {
          curve: curve,
          points: [
            { pFA: info.pFA, pH: info.pH, label: '当前 c=' + state.c.toFixed(2), color: '#ff8a5c', size: 6 }
          ].concat(state.showOptimal && isFinite(opt.cOpt) ? [{
            pFA: opt.pFA, pH: opt.pH, label: '最优 c*=' + opt.cOpt.toFixed(2), color: '#a78bfa', size: 6
          }] : []),
          subtitle: '理论 ROC · d′ = ' + state.dprime.toFixed(2) + ' · AUC = ' + U.fixed(U.normCdf(state.dprime / Math.SQRT2), 3)
        });
      }
    }

    /* ---- 3. 数值读数 ---- */
    const readout = U.$('#conceptReadout');
    if (readout) {
      const rows = [
        ['P(击中) = Φ(d′/2 − c)', U.fixed(info.pH, 3)],
        ['P(虚报) = Φ(−d′/2 − c)', U.fixed(info.pFA, 3)],
        ['似然比判据 β = exp(d′·c)', U.fixed(beta, 3)],
        ['该标准下的期望准确率', U.pct(acc, 1)],
        ['—', ''],
        ['最优判据 β* = [P(N)/P(S)]·[(V_CR−V_FA)/(V_H−V_M)]', U.fixed(opt.betaOpt, 3)],
        ['最优标准 c* = ln(β*)/d′', U.fixed(opt.cOpt, 3)],
        ['最优标准下 P(击中) / P(虚报)', U.fixed(opt.pH, 3) + ' / ' + U.fixed(opt.pFA, 3)],
        ['最优标准下的期望准确率', U.pct(opt.accuracy, 1)]
      ];
      readout.innerHTML = rows.map(function (r) {
        if (r[0] === '—') return '<div class="ro__sep"></div>';
        return '<div class="ro__row"><dt>' + U.escapeHtml(r[0]) + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('');
    }

    /* ---- 4. 准确率悖论 ---- */
    const paradoxCanvas = U.$('#paradoxCanvas');
    const paradoxText = U.$('#paradoxText');
    if (paradoxCanvas) {
      const lazyYes = state.priorP;        // 一律报"有目标"的准确率
      const lazyNo = 1 - state.priorP;     // 一律报"无目标"的准确率
      const lazy = Math.max(lazyYes, lazyNo);
      const ideal = isFinite(opt.accuracy) ? opt.accuracy : NaN;

      SDT.charts.drawBars(paradoxCanvas, {
        max: 1,
        items: [
          { label: '一律报"有目标"', value: lazyYes, color: 'rgba(120,180,205,0.55)' },
          { label: '一律报"无目标"', value: lazyNo, color: 'rgba(120,180,205,0.55)' },
          { label: '偷懒最优（看先验就猜）', value: lazy, color: 'rgba(243,181,68,0.9)' },
          { label: '理想观察者（用最优标准）', value: ideal, color: '#3fdbd0' }
        ],
        note: '当前先验 P(S) = ' + U.pct(state.priorP, 0) + '，d′ = ' + state.dprime.toFixed(1)
      });

      if (paradoxText) {
        const gap = ideal - lazy;
        paradoxText.innerHTML =
          '把先验概率拖到 ' + U.pct(state.priorP, 0) + '：<b>完全不看屏幕</b>、一律回答「' +
          (lazyYes >= lazyNo ? '有目标' : '无目标') + '」，准确率也有 <b>' + U.pct(lazy, 1) + '</b>；' +
          (isFinite(gap)
            ? '而真正用上信号证据、并把判据设在最优位置的理想观察者，准确率是 <b>' + U.pct(ideal, 1) +
              '</b>，只多出 ' + U.pct(gap, 1) + '。'
            : '') +
          ' 极端先验下这两者会非常接近 —— 这正是<b>准确率不能代替 d′</b> 的原因：' +
          '准确率把"猜得准"（受先验支配）和"看得清"（真正的辨别力）混在了一个数字里。' +
          '把先验拖回 50%，两者差距最大，此时准确率才比较接近辨别力。';
      }
    }
  }

  /** z 坐标 ROC（手绘，避免与 charts.js 的线性 ROC 混淆） */
  function drawZRoc(canvas, dprime, c, cOpt) {
    const p = SDT.charts.prepare(canvas);
    const ctx = p.ctx;
    const size = Math.min(p.w - 66 - 16, p.h - 26 - 40);
    if (size < 60) return;
    const box = { x: 66, y: 26, w: size, h: size };

    const range = 3.2;
    const X = function (v) { return box.x + ((v + range) / (2 * range)) * box.w; };
    const Y = function (v) { return box.y + box.h - ((v + range) / (2 * range)) * box.h; };

    // 网格
    ctx.strokeStyle = SDT.charts.THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = -3; v <= 3; v++) {
      ctx.moveTo(Math.round(X(v)) + 0.5, box.y); ctx.lineTo(Math.round(X(v)) + 0.5, box.y + box.h);
      ctx.moveTo(box.x, Math.round(Y(v)) + 0.5); ctx.lineTo(box.x + box.w, Math.round(Y(v)) + 0.5);
    }
    ctx.stroke();

    // 坐标轴
    ctx.strokeStyle = SDT.charts.THEME.axis;
    ctx.beginPath();
    ctx.moveTo(box.x + 0.5, box.y); ctx.lineTo(box.x + 0.5, box.y + box.h + 0.5);
    ctx.lineTo(box.x + box.w, box.y + box.h + 0.5);
    ctx.stroke();

    // 刻度
    ctx.fillStyle = SDT.charts.THEME.textDim;
    ctx.font = '11px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = -3; v <= 3; v++) {
      if (v === 0) continue;
      ctx.fillText(String(v), X(v), box.y + box.h + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = -3; v <= 3; v++) {
      if (v === 0) continue;
      ctx.fillText(String(v), box.x - 8, Y(v));
    }

    // 轴标题
    ctx.fillStyle = SDT.charts.THEME.text;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('z(虚报)', box.x + box.w, box.y + box.h + 24);
    ctx.save();
    ctx.translate(14, box.y + 4);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('z(击中)', 0, 0);
    ctx.restore();

    // 等方差模型下的 zROC 是一条直线：z(H) = z(F) + d′
    const zF1 = -range, zF2 = range;
    ctx.strokeStyle = '#3fdbd0';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(X(zF1), Y(zF1 + dprime));
    ctx.lineTo(X(zF2), Y(zF2 + dprime));
    ctx.stroke();

    // 当前点
    const info = SDT.sdt.fromDprimeC(dprime, c);
    const px = X(U.clamp(info.zF, -range, range));
    const py = Y(U.clamp(info.zH, -range, range));
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8a5c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(3,16,26,0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 最优点
    if (isFinite(cOpt)) {
      const oi = SDT.sdt.fromDprimeC(dprime, cOpt);
      const ox = X(U.clamp(oi.zF, -range, range));
      const oy = Y(U.clamp(oi.zH, -range, range));
      ctx.beginPath();
      ctx.arc(ox, oy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,16,26,0.9)';
      ctx.stroke();
    }

    // 截距标注
    ctx.fillStyle = 'rgba(232,244,250,0.9)';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('z(H) = z(F) + d′　（斜率 1，纵轴截距 = d′ = ' + dprime.toFixed(2) + '）', box.x, 4);
  }

  /* =======================================================================
   * 绑定
   * ===================================================================== */
  function bind() {
    const ids = ['#cDp', '#cC', '#cPrior', '#payVH', '#payVCR', '#payVFA', '#payVM', '#chkOptimal', '#chkZRoc'];
    ids.forEach(function (id) {
      const node = U.$(id);
      if (!node) return;
      node.addEventListener('input', refresh);
      node.addEventListener('change', refresh);
    });

    // 恢复默认值按钮
    const reset = U.$('#btnConceptReset');
    if (reset) {
      reset.addEventListener('click', function () {
        U.$('#cDp').value = 1.5;
        U.$('#cC').value = 0;
        U.$('#cPrior').value = 0.5;
        U.$('#payVH').value = CFG.SCENARIO.payoff.vH;
        U.$('#payVCR').value = CFG.SCENARIO.payoff.vCR;
        U.$('#payVFA').value = CFG.SCENARIO.payoff.vFA;
        U.$('#payVM').value = CFG.SCENARIO.payoff.vM;
        U.$('#chkOptimal').checked = true;
        U.$('#chkZRoc').checked = false;
        refresh();
      });
    }
  }

  SDT.concept = { init: bind, refresh: refresh, state: state };
})(window);
