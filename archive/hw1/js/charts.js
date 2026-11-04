/**
 * charts.js —— 手绘图表（Canvas 2D）
 * ---------------------------------------------------------------------------
 * 本网站不引入任何第三方图表库（ECharts / Chart.js 等一律不用），
 * 所有图形都用 Canvas 2D 亲手绘制，保证"双击 index.html 离线可跑"。
 *
 * 提供三种图：
 *   1. drawDistributions —— 噪音/信号双正态分布 + 判定标准，实时阴影面积
 *   2. drawRoc           —— ROC 曲线（含随机基线、本局点、多局对比点）
 *   3. drawBars          —— 水平条形图（用于"准确率悖论"对照）
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;

  const THEME = {
    grid: 'rgba(120,180,205,0.14)',
    axis: 'rgba(150,205,225,0.45)',
    text: 'rgba(170,205,222,0.92)',
    textDim: 'rgba(140,176,196,0.75)',
    noise: '#f3b544',      // 噪音分布：琥珀
    signal: '#3fdbd0',     // 信号分布：青
    criterion: '#ff8a5c',  // 实际判定标准：橙
    optimal: '#a78bfa',    // 最优判定标准：紫
    point: '#ffffff'
  };

  const FF_MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';
  const FF_SANS = '"Microsoft YaHei", "PingFang SC", sans-serif';

  /** 统一的画布准备：按设备像素比重设尺寸，只在尺寸变化时重建 */
  function prepare(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const cssW = Math.max(160, Math.round(rect.width));
    const cssH = Math.max(90, Math.round(rect.height));
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  /** 画一个带网格的直角坐标系，返回数据坐标 → 屏幕坐标的映射函数 */
  function makeFrame(ctx, box, xMin, xMax, yMin, yMax, opt) {
    const options = opt || {};
    const xTick = options.xTick || 1;
    const yTick = options.yTick || 0.25;
    const xFmt = options.xFmt || function (v) { return v.toFixed(1); };
    const yFmt = options.yFmt || function (v) { return v.toFixed(2); };
    const showY = options.showY !== false;

    const X = function (v) { return box.x + ((v - xMin) / (xMax - xMin)) * box.w; };
    const Y = function (v) { return box.y + box.h - ((v - yMin) / (yMax - yMin)) * box.h; };

    // 网格
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = Math.ceil(xMin / xTick) * xTick; v <= xMax + 1e-9; v += xTick) {
      const px = Math.round(X(v)) + 0.5;
      ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h);
    }
    for (let v = Math.ceil(yMin / yTick) * yTick; v <= yMax + 1e-9; v += yTick) {
      const py = Math.round(Y(v)) + 0.5;
      ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py);
    }
    ctx.stroke();

    // 坐标轴
    ctx.strokeStyle = THEME.axis;
    ctx.beginPath();
    ctx.moveTo(box.x + 0.5, box.y); ctx.lineTo(box.x + 0.5, box.y + box.h + 0.5);
    ctx.lineTo(box.x + box.w, box.y + box.h + 0.5);
    ctx.stroke();

    // 刻度文字
    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px ' + FF_MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(xMin / xTick) * xTick; v <= xMax + 1e-9; v += xTick) {
      if (Math.abs(v) < 1e-9) continue;
      ctx.fillText(xFmt(v), X(v), box.y + box.h + 6);
    }
    if (showY) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = Math.ceil(yMin / yTick) * yTick; v <= yMax + 1e-9; v += yTick) {
        if (Math.abs(v) < 1e-9) continue;
        ctx.fillText(yFmt(v), box.x - 8, Y(v));
      }
    }

    // 轴标题
    if (options.xLabel) {
      ctx.fillStyle = THEME.text;
      ctx.font = '12px ' + FF_SANS;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(options.xLabel, box.x + box.w, box.y + box.h + 24);
    }
    if (options.yLabel) {
      ctx.save();
      ctx.translate(12, box.y + 4);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = THEME.text;
      ctx.font = '12px ' + FF_SANS;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(options.yLabel, 0, 0);
      ctx.restore();
    }

    return { X: X, Y: Y };
  }

  /* =======================================================================
   * 1. 双分布 + 判定标准
   * ===================================================================== */
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   *   dprime, c, cOpt（可选，最优判据）, areaAlpha（阴影强度）
   *   showAreas, labels（是否画文字标注）
   */
  function drawDistributions(canvas, opts) {
    const o = opts || {};
    const dprime = Math.max(0, o.dprime || 0);
    const c = isFinite(o.c) ? o.c : 0;
    const p = prepare(canvas);
    const ctx = p.ctx;

    const box = { x: 52, y: 22, w: p.w - 52 - 18, h: p.h - 22 - 34 };
    if (box.w < 60 || box.h < 50) return;

    // x 轴范围：保证两条分布都完整可见
    const xMin = -3.6;
    const xMax = Math.max(dprime + 3.6, 4.6);
    const yMax = 0.45; // 标准正态峰值 0.399，留一点余量

    const frame = makeFrame(ctx, box, xMin, xMax, 0, yMax, {
      xTick: 1, yTick: 0.1,
      xFmt: function (v) { return String(Math.round(v)); },
      yFmt: function (v) { return v.toFixed(1); },
      xLabel: '判定变量（内部证据强度）',
      yLabel: '概率密度'
    });

    const baseY = box.y + box.h;
    const xc = c + dprime / 2;               // 判定标准在证据轴上的位置
    const sampleStep = 1.2;

    /** 在 [from, to] 区间内，用竖条填充某条曲线下方的面积 */
    function shadeCurve(mu, from, to, fillStyle) {
      ctx.fillStyle = fillStyle;
      const x0 = Math.max(from, xMin), x1 = Math.min(to, xMax);
      for (let x = x0; x <= x1; x += (sampleStep * (xMax - xMin)) / box.w) {
        const dens = U.normPdf(x - mu);
        const px = frame.X(x);
        const py = frame.Y(Math.min(dens, yMax));
        ctx.fillRect(px, py, Math.max(1, (sampleStep * (xMax - xMin)) / box.w + 0.6), baseY - py);
      }
    }

    // ---- 阴影：虚报（噪音分布右侧）与击中（信号分布右侧）----
    if (o.showAreas !== false) {
      shadeCurve(0, xc, xMax, 'rgba(243,181,68,0.42)');          // FA
      shadeCurve(dprime, xc, xMax, 'rgba(63,219,208,0.40)');     // H
    }

    // ---- 两条分布曲线 ----
    function plotCurve(mu, stroke) {
      ctx.beginPath();
      for (let px = 0; px <= box.w; px += 1) {
        const x = xMin + (px / box.w) * (xMax - xMin);
        const dens = Math.min(U.normPdf(x - mu), yMax);
        const y = frame.Y(dens);
        if (px === 0) ctx.moveTo(box.x, y); else ctx.lineTo(frame.X(x), y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // 曲线下方面积用同色淡填充，让两条分布的形状更易读
      ctx.lineTo(box.x + box.w, baseY);
      ctx.lineTo(box.x, baseY);
      ctx.closePath();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = stroke;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    plotCurve(0, THEME.noise);
    plotCurve(dprime, THEME.signal);

    // ---- 均值虚线 ----
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(180,210,225,0.35)';
    [0, dprime].forEach(function (mu) {
      ctx.beginPath();
      ctx.moveTo(frame.X(mu), box.y);
      ctx.lineTo(frame.X(mu), baseY);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // ---- 最优判据（可选）----
    if (isFinite(o.cOpt)) {
      const xOpt = o.cOpt + dprime / 2;
      if (xOpt > xMin && xOpt < xMax) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = THEME.optimal;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(frame.X(xOpt), box.y);
        ctx.lineTo(frame.X(xOpt), baseY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = THEME.optimal;
        ctx.font = '11px ' + FF_MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('c*=' + o.cOpt.toFixed(2), frame.X(xOpt) + 4, box.y + 2);
      }
    }

    // ---- 实际判据竖线 ----
    if (xc > xMin && xc < xMax) {
      ctx.strokeStyle = THEME.criterion;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(frame.X(xc), box.y);
      ctx.lineTo(frame.X(xc), baseY);
      ctx.stroke();
    }

    // ---- 文字标注 ----
    if (o.labels !== false) {
      ctx.font = '12px ' + FF_SANS;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      const xNoise = frame.X(0);
      ctx.fillStyle = THEME.noise;
      ctx.fillText('噪音 N(0,1)', xNoise, box.y + 12);
      ctx.fillStyle = THEME.noise;
      ctx.font = '10px ' + FF_MONO;
      ctx.fillText('μ=0', xNoise, box.y + 26);

      const xSig = frame.X(dprime);
      ctx.fillStyle = THEME.signal;
      ctx.font = '12px ' + FF_SANS;
      ctx.fillText('信号 N(d′,1)', xSig, box.y + 12);
      ctx.font = '10px ' + FF_MONO;
      ctx.fillText('μ=' + dprime.toFixed(2), xSig, box.y + 26);

      // 判据标签
      ctx.font = '11px ' + FF_MONO;
      ctx.fillStyle = THEME.criterion;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (xc > xMin && xc < xMax) {
        ctx.fillText('c', frame.X(xc), baseY - 16);
      }

      // 阴影区标注：把 P(击中)、P(虚报) 标在右上角空白处
      if (o.showAreas !== false) {
        const info = SDT.sdt.fromDprimeC(dprime, c);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = THEME.signal;
        ctx.fillText('P(击中)=' + info.pH.toFixed(2), box.x + box.w - 6, box.y + 42);
        ctx.fillStyle = THEME.noise;
        ctx.fillText('P(虚报)=' + info.pFA.toFixed(2), box.x + box.w - 6, box.y + 58);
      }
    }
  }

  /* =======================================================================
   * 2. ROC 曲线
   * ===================================================================== */
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   *   curve: [{pFA, pH}] 理论 ROC
   *   points: [{pFA, pH, label, color}] 实测点（可多个，用于多局对比）
   *   diagonal: 是否画随机基线
   */
  function drawRoc(canvas, opts) {
    const o = opts || {};
    const p = prepare(canvas);
    const ctx = p.ctx;

    const size = Math.min(p.w - 62 - 16, p.h - 26 - 40);
    if (size < 60) return;
    const box = { x: 62, y: 26, w: size, h: size };

    const frame = makeFrame(ctx, box, 0, 1, 0, 1, {
      xTick: 0.2, yTick: 0.2,
      xFmt: function (v) { return v.toFixed(1); },
      yFmt: function (v) { return v.toFixed(1); },
      xLabel: 'P(虚报)',
      yLabel: 'P(击中)'
    });

    // 随机猜测基线
    if (o.diagonal !== false) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(150,190,210,0.5)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(frame.X(0), frame.Y(0));
      ctx.lineTo(frame.X(1), frame.Y(1));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = THEME.textDim;
      ctx.font = '10px ' + FF_MONO;
      ctx.save();
      ctx.translate(frame.X(0.62), frame.Y(0.62));
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'center';
      ctx.fillText('随机猜测', 0, -4);
      ctx.restore();
    }

    // 理论 ROC
    if (o.curve && o.curve.length) {
      ctx.beginPath();
      o.curve.forEach(function (pt, i) {
        const x = frame.X(U.clamp(pt.pFA, 0, 1));
        const y = frame.Y(U.clamp(pt.pH, 0, 1));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = THEME.signal;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 曲线下方面积（AUC）用淡色填充
      ctx.lineTo(frame.X(1), frame.Y(0));
      ctx.lineTo(frame.X(0), frame.Y(0));
      ctx.closePath();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = THEME.signal;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 数据点
    (o.points || []).forEach(function (pt) {
      if (!isFinite(pt.pFA) || !isFinite(pt.pH)) return;
      const x = frame.X(U.clamp(pt.pFA, 0, 1));
      const y = frame.Y(U.clamp(pt.pH, 0, 1));
      ctx.beginPath();
      ctx.arc(x, y, pt.size || 5.5, 0, Math.PI * 2);
      ctx.fillStyle = pt.color || THEME.point;
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,16,26,0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (pt.label) {
        ctx.fillStyle = 'rgba(232,244,250,0.95)';
        ctx.font = '11px ' + FF_SANS;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const tx = x + 9;
        ctx.fillText(pt.label, Math.min(tx, box.x + box.w - 40), y - 6);
      }
    });

    // 图注：本局 AUC 的理论值由调用方通过 subtitle 传入
    if (o.subtitle) {
      ctx.fillStyle = THEME.text;
      ctx.font = '12px ' + FF_SANS;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(o.subtitle, box.x, 4);
    }
  }

  /* =======================================================================
   * 3. 水平条形图
   * ===================================================================== */
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts {items:[{label, value, color, note}], max, valueFmt}
   */
  function drawBars(canvas, opts) {
    const o = opts || {};
    const items = o.items || [];
    const p = prepare(canvas);
    const ctx = p.ctx;
    if (!items.length) return;

    const labelW = 104;
    const valueW = 62;
    const rowH = Math.min(38, (p.h - 16) / items.length);
    const barMax = (p.w - labelW - valueW - 20);
    const max = o.max || Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    const fmt = o.valueFmt || function (v) { return (v * 100).toFixed(1) + '%'; };

    items.forEach(function (item, i) {
      const y = 10 + i * rowH;
      const barH = Math.max(10, rowH - 14);

      ctx.fillStyle = THEME.text;
      ctx.font = '12px ' + FF_SANS;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, labelW - 10, y + barH / 2);

      // 轨道
      ctx.fillStyle = 'rgba(120,180,205,0.14)';
      ctx.fillRect(labelW, y, barMax, barH);

      // 条
      const w = Math.max(1, (U.clamp(item.value / max, 0, 1)) * barMax);
      ctx.fillStyle = item.color || THEME.signal;
      ctx.fillRect(labelW, y, w, barH);

      // 数值
      ctx.fillStyle = 'rgba(232,244,250,0.95)';
      ctx.font = '12px ' + FF_MONO;
      ctx.textAlign = 'left';
      ctx.fillText(fmt(item.value), labelW + barMax + 8, y + barH / 2);
    });

    if (o.note) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '11px ' + FF_SANS;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(o.note, labelW, p.h - 2);
    }
  }

  SDT.charts = {
    THEME: THEME,
    prepare: prepare,
    drawDistributions: drawDistributions,
    drawRoc: drawRoc,
    drawBars: drawBars
  };
})(window);
