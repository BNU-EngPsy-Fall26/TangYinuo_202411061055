/**
 * sonar.js —— 声呐刺激生成与 Canvas 渲染
 * ---------------------------------------------------------------------------
 * 本文件负责"看见信号"这件事，分两半：
 *
 *  A. 刺激生成 generateTrial()
 *     生成一张 时间(列) × 频率(行) 的瀑布图矩阵，数值代表该时频格上的能量。
 *        · 背景噪声：指数分布（声呐功率的典型模型），在时间-频率上随机散斑；
 *        · 偶发爆发：低概率的宽频短促能量（虾群、鲸歌、过船），信号/噪音试次都可能出现，
 *                    是本任务的"额外噪声源"，也是误报的主要来源之一；
 *        · 目标回波：一条占据固定频率、沿时间连续延伸的窄带线谱，
 *                    振幅由**设计 d′** 决定 —— 这正是"难度调节"的物理载体。
 *
 *  B. 渲染 Renderer
 *     把矩阵按"声呐色标"画到 Canvas；支持逐列揭示（模拟扫描），
 *     并在下采样时把已揭示的列缓存到离屏画布，保证动画流畅。
 *
 *  说明：设计 d′ 控制的是**物理刺激的信噪比**；被试实际达成的 d′ 会受观察策略、
 *  时间限制与内部噪声影响而偏低，两者都会在结果页并列呈现。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;

  /* =======================================================================
   * 常量
   * ===================================================================== */
  const SIZE = { freqBins: 64, timeBins: 32 };  // 矩阵尺寸：64 个频率格 × 32 个时间格
  const NOISE_SCALE = 4.2;   // 指数噪声归一化系数（均值 1 → 约 0.238）
  const BURST_RATE = 0.22;   // 每次试次出现宽频爆发的概率
  const BAND_WEIGHTS = [0.5, 1.0, 0.5]; // 线谱在相邻 3 个频率格上的能量权重（模拟频谱泄漏）

  /** 频率轴标注范围（仅用于显示，营造设备感） */
  const FREQ_RANGE = { min: 0.4, max: 2.2, unit: 'kHz' };

  /**
   * 设计 d′ → 线谱振幅（相对归一化噪声单位的增量）
   * 经验标定：d′≈1 时线谱刚好需要仔细追踪才可辨；d′≈3 时一眼可见。
   */
  function amplitudeForDprime(dprime) {
    return 0.085 + 0.115 * dprime;
  }

  /* =======================================================================
   * A. 刺激生成
   * ===================================================================== */
  /**
   * @param {object} opts
   *   @param {Function} opts.rng      随机数生成器
   *   @param {boolean}  opts.isSignal 本次试次是否含目标回波
   *   @param {number}   opts.dprime   设计 d′（难度）
   *   @param {number}   [opts.freqBins]
   *   @param {number}   [opts.timeBins]
   * @returns {{data:Float32Array, freqBins:number, timeBins:number,
   *            targetBin:number, amplitude:number, hasBurst:boolean}}
   */
  function generateTrial(opts) {
    const rng = opts.rng || Math.random;
    const freqBins = opts.freqBins || SIZE.freqBins;
    const timeBins = opts.timeBins || SIZE.timeBins;
    const total = freqBins * timeBins;
    const data = new Float32Array(total);

    // ---- 1) 背景噪声：指数分布 + 归一化 ----
    for (let col = 0; col < timeBins; col++) {
      const base = col * freqBins;
      for (let row = 0; row < freqBins; row++) {
        const e = -Math.log(1 - rng());      // Exp(1)
        data[base + row] = e / NOISE_SCALE;  // 归一化到 0..1 区间（长尾自然形成亮点）
      }
    }

    // ---- 2) 偶发宽频爆发（信号/噪音试次都可能出现，属额外噪声）----
    let hasBurst = false;
    if (rng() < BURST_RATE) {
      hasBurst = true;
      const nBurst = rng() < 0.75 ? 1 : 2;
      for (let b = 0; b < nBurst; b++) {
        const col = U.randInt(rng, 0, timeBins - 1);
        const center = U.randInt(rng, 8, freqBins - 9);
        const width = U.randInt(rng, 10, 24);       // 宽频：跨越十几个频率格
        const gain = 0.35 + rng() * 0.45;           // 爆发强度
        const base = col * freqBins;
        for (let row = Math.max(0, center - width); row <= Math.min(freqBins - 1, center + width); row++) {
          const d = Math.abs(row - center) / width;
          data[base + row] += gain * (1 - d * d);   // 中间强、边缘弱
        }
      }
    }

    // ---- 3) 目标回波：窄带线谱 ----
    let targetBin = -1;
    let amplitude = 0;
    if (opts.isSignal) {
      amplitude = amplitudeForDprime(opts.dprime);
      // 频率位置每个试次随机，避免被试记住固定位置
      targetBin = U.randInt(rng, 6, freqBins - 8);

      // 时间跨度：占 55%–75% 的时间格，中间留 1–2 处断点（更贴近真实回波）
      const span = Math.round(timeBins * (0.55 + rng() * 0.20));
      const start = U.randInt(rng, 1, Math.max(1, timeBins - span - 1));
      const gaps = [];
      const nGaps = U.randInt(rng, 1, 2);
      for (let g = 0; g < nGaps; g++) {
        gaps.push(U.randInt(rng, start + 2, Math.max(start + 2, start + span - 3)));
      }

      const rows = [targetBin - 1, targetBin, targetBin + 1];
      const weights = BAND_WEIGHTS;

      for (let col = start; col < start + span && col < timeBins; col++) {
        if (gaps.some(function (g) { return g === col; })) continue; // 断点
        // 每一列的能量略有起伏，模拟目标姿态/距离的微小变化
        const colGain = amplitude * U.clamp(1 + 0.30 * U.randNormal(rng), 0.35, 1.8);
        const base = col * freqBins;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (row < 0 || row >= freqBins) continue;
          data[base + row] += colGain * weights[r];
        }
      }
    }

    return {
      data: data,
      freqBins: freqBins,
      timeBins: timeBins,
      targetBin: targetBin,
      amplitude: amplitude,
      hasBurst: hasBurst
    };
  }

  /* =======================================================================
   * 色标：把能量值 0..1 映射为深海声呐配色（深蓝 → 青 → 琥珀 → 近白）
   * ===================================================================== */
  const COLOR_STOPS = [
    [0.00, [3, 15, 25]],
    [0.18, [7, 42, 69]],
    [0.34, [13, 85, 112]],
    [0.50, [23, 134, 140]],
    [0.66, [53, 191, 166]],
    [0.80, [224, 177, 63]],
    [0.92, [255, 217, 119]],
    [1.00, [255, 249, 232]]
  ];

  /** 构建 256 级调色板查找表，避免逐格做插值运算 */
  const PALETTE = (function buildPalette() {
    const lut = new Array(256);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let lo = COLOR_STOPS[0], hi = COLOR_STOPS[COLOR_STOPS.length - 1];
      for (let s = 0; s < COLOR_STOPS.length - 1; s++) {
        if (v >= COLOR_STOPS[s][0] && v <= COLOR_STOPS[s + 1][0]) {
          lo = COLOR_STOPS[s]; hi = COLOR_STOPS[s + 1]; break;
        }
      }
      const span = (hi[0] - lo[0]) || 1;
      const t = (v - lo[0]) / span;
      const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t);
      const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t);
      const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t);
      lut[i] = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    return lut;
  })();

  function colorFor(value) {
    const idx = Math.max(0, Math.min(255, Math.round(value * 255)));
    return PALETTE[idx];
  }

  /* =======================================================================
   * B. 渲染器
   * ===================================================================== */
  const PAD = { top: 14, right: 16, bottom: 30, left: 62 };

  /**
   * 创建一个绑定到 canvas 的渲染器。
   * @param {HTMLCanvasElement} canvas
   */
  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let off = null, offCtx = null;      // 离屏画布：缓存已揭示的列
    let offW = 0, offH = 0;
    let paintedUntil = 0;               // 离屏画布中已经画到第几列
    let currentMatrix = null;

    /** 依据 CSS 尺寸与设备像素比重设画布（保证高分屏清晰） */
    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      const cssW = Math.max(320, Math.round(rect.width));
      const cssH = Math.max(220, Math.round(rect.height));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      W = cssW; H = cssH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      offW = Math.round(W - PAD.left - PAD.right);
      offH = Math.round(H - PAD.top - PAD.bottom);
      off = document.createElement('canvas');
      off.width = Math.round(offW * dpr);
      off.height = Math.round(offH * dpr);
      offCtx = off.getContext('2d');
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintedUntil = 0;
      if (currentMatrix) paintColumns(0, currentMatrix.timeBins, currentMatrix);
    }

    /** 把 [from, to) 列画进离屏画布 */
    function paintColumns(from, to, matrix) {
      const cellW = offW / matrix.timeBins;
      const cellH = offH / matrix.freqBins;
      for (let col = from; col < to; col++) {
        const x = col * cellW;
        const base = col * matrix.freqBins;
        for (let row = 0; row < matrix.freqBins; row++) {
          offCtx.fillStyle = colorFor(matrix.data[base + row]);
          // 行列各多画 1px，避免缩放时出现细缝
          offCtx.fillRect(x, row * cellH, cellW + 1, cellH + 1);
        }
      }
      paintedUntil = Math.max(paintedUntil, to);
    }

    /** 画坐标轴、网格与刻度 */
    function paintFrame(matrix) {
      const plotX = PAD.left, plotY = PAD.top;
      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;

      // 网格线（频率每 16 格、时间每 8 格）
      ctx.save();
      ctx.strokeStyle = 'rgba(120,180,205,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let row = 0; row <= matrix.freqBins; row += 16) {
        const y = Math.round(plotY + (row / matrix.freqBins) * plotH) + 0.5;
        ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y);
      }
      for (let col = 0; col <= matrix.timeBins; col += 8) {
        const x = Math.round(plotX + (col / matrix.timeBins) * plotW) + 0.5;
        ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH);
      }
      ctx.stroke();

      // 外框
      ctx.strokeStyle = 'rgba(150,205,225,0.35)';
      ctx.strokeRect(plotX + 0.5, plotY + 0.5, plotW - 1, plotH - 1);

      // 频率轴标签（下 → 上）
      ctx.fillStyle = 'rgba(160,196,214,0.85)';
      ctx.font = '11px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const row = (matrix.freqBins / 4) * i;
        const y = plotY + plotH - (row / matrix.freqBins) * plotH;
        const freq = FREQ_RANGE.min + (FREQ_RANGE.max - FREQ_RANGE.min) * (row / matrix.freqBins);
        ctx.fillText(freq.toFixed(1), plotX - 8, y);
      }
      ctx.save();
      ctx.translate(16, plotY + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(160,196,214,0.7)';
      ctx.fillText('频率 / ' + FREQ_RANGE.unit, 0, 0);
      ctx.restore();

      // 时间轴标签（t0 → t4 表示观察窗口内的相对时刻）
      ctx.fillStyle = 'rgba(160,196,214,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= 4; i++) {
        const x = plotX + (plotW * i) / 4;
        ctx.fillText('t' + i, x, plotY + plotH + 8);
      }
      ctx.restore();
    }

    /**
     * 主绘制入口
     * @param {object} matrix generateTrial 的返回值
     * @param {number} revealed 已揭示的列数（0 表示什么都没有）
     * @param {object} [opt] {scanline:boolean}
     */
    function draw(matrix, revealed, opt) {
      const options = opt || {};
      if (matrix !== currentMatrix) {
        currentMatrix = matrix;
        paintedUntil = 0;
      }
      const target = Math.max(0, Math.min(matrix.timeBins, Math.round(revealed)));
      if (target > paintedUntil) paintColumns(paintedUntil, target, matrix);

      ctx.clearRect(0, 0, W, H);

      // 底色
      ctx.fillStyle = '#03101a';
      ctx.fillRect(0, 0, W, H);

      const plotX = PAD.left, plotY = PAD.top;
      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;

      // 已揭示部分
      const visibleW = (target / matrix.timeBins) * plotW;
      if (visibleW > 0) {
        ctx.drawImage(off, 0, 0, offW * dpr, offH * dpr,
          plotX, plotY, visibleW, plotH);
      }

      paintFrame(matrix);

      // 扫描线
      if (options.scanline && target > 0 && target <= matrix.timeBins) {
        const x = plotX + (target / matrix.timeBins) * plotW;
        const grad = ctx.createLinearGradient(x - 16, 0, x, 0);
        grad.addColorStop(0, 'rgba(63,219,208,0)');
        grad.addColorStop(1, 'rgba(63,219,208,0.45)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 16, plotY, 16, plotH);
        ctx.strokeStyle = 'rgba(150,255,240,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH);
        ctx.stroke();
      }
    }

    /** 待机画面：整屏噪底 + 一行提示文字 */
    function drawIdle(message) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#03101a';
      ctx.fillRect(0, 0, W, H);
      const plotX = PAD.left, plotY = PAD.top;
      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;
      const cols = 48, rows = 40;
      const cw = plotW / cols, ch = plotH / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          ctx.fillStyle = colorFor((-Math.log(1 - Math.random())) / NOISE_SCALE * 0.8);
          ctx.fillRect(plotX + c * cw, plotY + r * ch, cw + 1, ch + 1);
        }
      }
      ctx.strokeStyle = 'rgba(150,205,225,0.35)';
      ctx.strokeRect(plotX + 0.5, plotY + 0.5, plotW - 1, plotH - 1);
      if (message) {
        ctx.fillStyle = 'rgba(232,244,250,0.92)';
        ctx.font = '600 20px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, plotX + plotW / 2, plotY + plotH / 2);
      }
    }

    return { resize: resize, draw: draw, drawIdle: drawIdle, get size() { return { W: W, H: H }; } };
  }

  SDT.sonar = {
    SIZE: SIZE,
    FREQ_RANGE: FREQ_RANGE,
    NOISE_SCALE: NOISE_SCALE,
    amplitudeForDprime: amplitudeForDprime,
    colorFor: colorFor,
    generateTrial: generateTrial,
    createRenderer: createRenderer
  };
})(window);
