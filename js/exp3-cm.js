/* ============================================================
 * exp3-cm.js —— 实验三：比例判断（Cleveland–McGill）
 *
 * 复现：Cleveland & McGill (1984) 图形知觉研究
 *       人们对"部分占整体比例"的判断，在饼图 / 堆叠条形图上都有系统误差。
 *
 * 改进（自选新条件）：给图形加 .25 / .50 / .75 刻度线
 *       依据 Hollands & Dyre (2000)：刻度线为比例判断提供了"锚点"，
 *       应当降低判断误差。这是课堂上给出的改进示例之一，本研究把它做成
 *       真正的被试内条件去检验。
 *
 * 设计：2（图形：堆叠条形图 / 饼图）× 2（刻度线：无 / 有）被试内
 *       每格 10 试次，共 40 试次。
 *
 * 因变量：判断误差 = |估计百分比 − 真实百分比|（百分点）
 * 预测：① 复现：饼图误差 > 条形图（Cleveland & McGill 1984）；
 *       ② 改进：加刻度线后误差下降，且对饼图的改善更明显（交互）。
 * ============================================================ */

(function () {
  'use strict';

  var A = window.ALAB;

  var GEO = { W: 560, H: 360 };
  var PROPS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.6, 0.65, 0.7, 0.75, 0.8];
  var DARK = '#2b3f57';
  var LIGHT = '#dfe7f0';

  function drawPie(g, prop, ticks) {
    var cx = 280, cy = 180, r = 120;
    g.fillStyle = LIGHT;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = DARK;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prop);
    g.closePath();
    g.fill();

    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();

    if (ticks) {
      [0.25, 0.5, 0.75].forEach(function (k) {
        var ang = -Math.PI / 2 + Math.PI * 2 * k;
        var x1 = cx + Math.cos(ang) * (r + 6);
        var y1 = cy + Math.sin(ang) * (r + 6);
        var x2 = cx + Math.cos(ang) * (r + 24);
        var y2 = cy + Math.sin(ang) * (r + 24);
        g.strokeStyle = '#8794a5';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
        g.fillStyle = '#6b7c8f';
        g.font = '13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.round(k * 100)), cx + Math.cos(ang) * (r + 38),
                   cy + Math.sin(ang) * (r + 38));
      });
    }
  }

  function drawBar(g, prop, ticks) {
    var H = 250, W = 96;
    var x = 280 - W / 2, bottom = 320, top = bottom - H;

    g.fillStyle = LIGHT;
    g.fillRect(x, top, W, H);

    var darkH = H * prop;
    g.fillStyle = DARK;
    g.fillRect(x, bottom - darkH, W, darkH);

    g.strokeStyle = '#aab6c4';
    g.lineWidth = 1.5;
    g.strokeRect(x, top, W, H);

    if (ticks) {
      [0.25, 0.5, 0.75].forEach(function (k) {
        var y = bottom - H * k;
        g.strokeStyle = '#8794a5';
        g.lineWidth = 1;
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(x - 22, y);
        g.lineTo(x + W + 22, y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#6b7c8f';
        g.font = '13px system-ui, sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(Math.round(k * 100) + '%', x + W + 30, y);
      });
    }
  }

  function drawChart(g, trial) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, GEO.W, GEO.H);
    if (trial.format === 'pie') drawPie(g, trial.prop, trial.ticks === 1);
    else drawBar(g, trial.prop, trial.ticks === 1);
  }

  /* ---------------- 试次 ---------------- */

  function runTrial(trial, ctx, canvas, isPractice) {
    var g = canvas.getContext('2d');
    ctx.hint('深色部分占整体的百分之多少？拖动滑块后按 <kbd>Enter</kbd> 确认');

    drawChart(g, trial);
    var t0 = performance.now();

    return new Promise(function (resolve) {
      ctx.respEl.innerHTML = '';

      var valEl = A.el('div', { class: 'cm-val', text: '50%' });
      var range = A.el('input', {
        type: 'range', min: '0', max: '100', step: '1', value: '50',
        'aria-label': '估计百分比'
      });
      var btn = A.el('button', { class: 'btn primary', text: '确认（Enter）' });

      range.addEventListener('input', function () {
        valEl.textContent = range.value + '%';
      });

      var done = false;
      function confirm() {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        ctx.respEl.innerHTML = '';
        var est = Number(range.value);
        var truePct = trial.prop * 100;
        var rec = {
          cond: trial.format + '_' + (trial.ticks ? 'ticks' : 'noticks'),
          format: trial.format,
          ticks: trial.ticks,
          truePct: Math.round(truePct * 10) / 10,
          estimate: est,
          errSigned: Math.round((est - truePct) * 10) / 10,
          absErr: Math.round(Math.abs(est - truePct) * 10) / 10,
          rt: Math.round(performance.now() - t0),
          correct: true
        };
        var wait = Promise.resolve();
        if (isPractice) {
          wait = ctx.feedback('实际是 ' + Math.round(truePct) + '%，你答 ' + est + '%', true, 1200);
        }
        wait.then(function () {
          A.sleep(200).then(function () { resolve(rec); });
        });
      }

      function onKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      }

      btn.addEventListener('click', confirm);
      document.addEventListener('keydown', onKey);

      ctx.respEl.appendChild(
        A.el('div', { class: 'cm-resp' }, [
          A.el('div', { class: 'cm-line' }, [range, valEl]),
          A.el('div', { class: 'cm-scale' }, [
            A.el('span', { text: '0%' }),
            A.el('span', { text: '50%' }),
            A.el('span', { text: '100%' })
          ]),
          A.el('div', { style: 'text-align:center;margin-top:6px' }, [btn])
        ])
      );
    });
  }

  /* ---------------- 注册 ---------------- */

  A.register({
    id: 'cm',
    week: 'W7',
    title: '比例判断',
    ref: 'Cleveland & McGill (1984). Graphical perception. JASA. / Hollands & Dyre (2000). Bias in proportion judgments.',
    minutes: '约 5 分钟',
    trialsText: '练习 4 + 正式 40（2×2 每格 10）',

    design: '2×2 被试内：图形（条形/饼）× 刻度线（无/有），每格 10 试次',
    improvement: '在饼图与堆叠条形图上加 .25/.50/.75 刻度线，检验"锚点"能否降低比例判断误差。',
    prediction: '① 复现：饼图误差大于条形图；② 改进：有刻度线时误差下降，且饼图受益更大（交互）。',

    intro:
      '<p>每个试次会显示一个图形：<b>堆叠条形图</b>或<b>饼图</b>，其中一部分是<b>深色</b>。</p>' +
      '<p>任务：估计<b>深色部分占整体的百分之多少</b>。</p>' +
      '<ul>' +
      '<li>拖动滑块（或按方向键微调），按 <kbd>Enter</kbd> 或点「确认」提交。</li>' +
      '<li>凭第一感觉判断即可，不需要精确计算，也没有时间限制。</li>' +
      '<li>有的图形会带 25% / 50% / 75% 的刻度线，有的不带。</li>' +
      '</ul>' +
      '<p class="dim">先做 4 个练习试次（会告诉你真实答案），再进入正式实验 40 试次。</p>' +

      '<h3>这个实验的改进点</h3>' +
      '<p>Cleveland 与 McGill（1984）系统比较了不同图形的读数误差，结论是<b>位置/长度编码优于角度/面积编码</b>，' +
      '所以饼图判断通常比条形图更差。Hollands 与 Dyre（2000）进一步指出，比例判断的偏差来自"锚点不足"。' +
      '本研究把这两条合起来做成一个 2×2 设计：如果刻度线真的提供了锚点，那么它应该<b>整体降低误差</b>，' +
      '并且对依赖角度编码的饼图<b>帮助更大</b>——这是一个可以证伪的交互预测。</p>',

    start: async function (ctx) {
      var canvas = A.el('canvas', { class: 'canvas', width: GEO.W, height: GEO.H });
      ctx.setStage([canvas]);

      /* --- 练习：4 试次，两种图形各 2 次，无刻度 --- */
      var practice = [
        { format: 'bar', ticks: 0, prop: 0.3 },
        { format: 'pie', ticks: 0, prop: 0.7 },
        { format: 'bar', ticks: 0, prop: 0.65 },
        { format: 'pie', ticks: 0, prop: 0.35 }
      ];
      practice = A.shuffle(practice).map(function (t) {
        t.cond = t.format + '_noticks';
        return t;
      });

      /* --- 正式：4 格 × 10 试次，每格内数值打乱 --- */
      var cells = [
        { format: 'bar', ticks: 0 },
        { format: 'bar', ticks: 1 },
        { format: 'pie', ticks: 0 },
        { format: 'pie', ticks: 1 }
      ];
      var formal = [];
      cells.forEach(function (cell) {
        A.shuffle(PROPS).forEach(function (p) {
          formal.push({
            format: cell.format,
            ticks: cell.ticks,
            prop: p,
            cond: cell.format + '_' + (cell.ticks ? 'ticks' : 'noticks')
          });
        });
      });
      formal = A.shuffle(formal);

      await ctx.pause(
        '<div class="big-msg">练习阶段</div>' +
        '<p class="dim">4 个试次，提交后会告诉你真实比例。准备好就点「开始练习」。</p>',
        '开始练习');

      await ctx.runTrials(practice, function (t, i, c) {
        return runTrial(t, c, canvas, true);
      });

      await ctx.pause(
        '<div class="big-msg">练习结束</div>' +
        '<p class="dim">正式实验 40 试次，<b>没有反馈</b>。约 4 分钟，中途不要切换窗口。</p>',
        '进入正式实验');

      var results = await ctx.runTrials(formal, function (t, i, c) {
        return runTrial(t, c, canvas, false);
      });

      ctx.hint('');
      await ctx.finish(results);
    }
  });
})();
