/* ============================================================
 * exp1-cb.js —— 实验一：闪烁变化盲（Change Blindness）
 *
 * 复现：Rensink, O'Regan & Clark (1997) 的闪烁范式
 *       两张画面交替显示、中间插空白，观察者很难发现画面中的变化。
 *
 * 改进（自选新条件）：注意集（attentional set）操纵
 *       全程只要求被试监测「蓝色」方块；变化事件随机发生在
 *       目标色（蓝色）物体 或 非目标色物体 上，各 12 试次。
 *       依据 Most et al. (2001)：与当前注意定势一致的刺激更容易被察觉。
 *
 * 设计：单因素被试内（变化位置：目标色 / 非目标色）
 * 因变量：变化检测 RT（ms）、正确率
 * 预测：目标色条件的 RT 更短、正确率更高（d ≈ 0.5–0.9）
 * ============================================================ */

(function () {
  'use strict';

  var A = window.ALAB;

  var TARGET_COLOR = '#2f6fed';                 // 目标色：蓝
  var OTHER_COLORS = ['#e05252', '#2f9e68', '#e3b23c', '#8a63d2', '#23a6a6', '#c94f9b'];

  var GEO = {
    W: 600, H: 380,
    COLS: 6, ROWS: 4,
    CW: 96, CH: 88,
    OW: 60, OH: 38,
    MX: 12, MY: 14
  };

  var SHOW_MS = 400;      // 单帧呈现
  var BLANK_MS = 130;     // 帧间空白
  var TIMEOUT_MS = 15000; // 单试次上限

  function cellCenter(c, r) {
    return {
      x: GEO.MX + c * GEO.CW + GEO.CW / 2,
      y: GEO.MY + r * GEO.CH + GEO.CH / 2
    };
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  /**
   * 生成一个试次的刺激：24 个彩色方块，其中 3~5 个蓝色；
   * 随机挑一个物体整体平移（变化），位置由 cond 决定：
   *   cond = 'inset'  变化落在蓝色（目标色）物体上
   *   cond = 'outset' 变化落在非蓝色物体上
   */
  function buildStimulus(cond) {
    var n = GEO.COLS * GEO.ROWS;
    var nBlue = A.randInt(3, 5);
    var idx = A.shuffle(Array.from({ length: n }, function (_, i) { return i; }));

    var colors = new Array(n);
    idx.slice(0, nBlue).forEach(function (i) { colors[i] = TARGET_COLOR; });
    idx.slice(nBlue).forEach(function (i) { colors[i] = A.choice(OTHER_COLORS); });

    var objects = colors.map(function (color, i) {
      var p = cellCenter(i % GEO.COLS, Math.floor(i / GEO.COLS));
      return { color: color, x: p.x + A.rand(-5, 5), y: p.y + A.rand(-5, 5) };
    });

    var pool = objects
      .map(function (o, i) { return i; })
      .filter(function (i) {
        return cond === 'inset' ? objects[i].color === TARGET_COLOR
                                : objects[i].color !== TARGET_COLOR;
      });

    var changeIdx = A.choice(pool);
    var dx = A.choice([-1, 1]) * A.randInt(16, 22);
    var dy = A.choice([-1, 1]) * A.randInt(10, 18);

    return { cond: cond, objects: objects, changeIdx: changeIdx, dx: dx, dy: dy };
  }

  function drawFrame(g, stim, shifted) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, GEO.W, GEO.H);
    stim.objects.forEach(function (o, i) {
      var x = o.x, y = o.y;
      if (shifted && i === stim.changeIdx) { x += stim.dx; y += stim.dy; }
      roundRect(g, x - GEO.OW / 2, y - GEO.OH / 2, GEO.OW, GEO.OH, 7);
      g.fillStyle = o.color;
      g.fill();
    });
  }

  /* ---------------- 单个试次 ---------------- */

  function runTrial(trial, ctx, canvas, isPractice) {
    var g = canvas.getContext('2d');
    ctx.hint('变化发生在<b>蓝色</b>方块上吗？按 <kbd>F</kbd> = 是，<kbd>J</kbd> = 否');

    drawFrame(g, trial, false);
    var t0 = performance.now();

    var keyP = ctx.waitResponse(['f', 'j'], ['是 · 在蓝色方块上', '否 · 不在蓝色方块'], TIMEOUT_MS, t0);

    var stop = false;
    (function flicker() {
      if (stop) return;
      drawFrame(g, trial, false);
      A.sleep(SHOW_MS).then(function () {
        if (stop) return;
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, GEO.W, GEO.H);
        return A.sleep(BLANK_MS);
      }).then(function () {
        if (stop) return;
        drawFrame(g, trial, true);
        return A.sleep(SHOW_MS);
      }).then(function () {
        if (stop) return;
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, GEO.W, GEO.H);
        return A.sleep(BLANK_MS);
      }).then(flicker);
    })();

    return keyP.then(function (r) {
      stop = true;
      var correct = !r.timeout && ((r.key === 'f') === (trial.cond === 'inset'));
      var rec = {
        cond: trial.cond,
        rt: r.timeout ? null : Math.round(r.rt),
        correct: correct,
        resp: r.timeout ? 'timeout' : (r.key === 'f' ? 'yes' : 'no'),
        timeout: r.timeout ? 1 : 0
      };

      var done = Promise.resolve();
      if (isPractice) {
        var msg = trial.cond === 'inset'
          ? '正确：变化在蓝色方块上'
          : '正确：变化不在蓝色方块上';
        done = ctx.feedback(correct ? '✔ ' + msg : '✘ ' + msg, correct, 1000);
      }
      return done.then(function () {
        return A.sleep(220).then(function () { return rec; });
      });
    });
  }

  /* ---------------- 注册实验 ---------------- */

  A.register({
    id: 'cb',
    week: 'W5',
    title: '闪烁变化盲',
    ref: "Rensink, O'Regan & Clark (1997). To see or not to see: The need for attention to perceive changes in scenes. Psychological Science.",
    minutes: '约 5 分钟',
    trialsText: '练习 6 + 正式 24（目标色 12 / 非目标色 12）',

    design: '单因素被试内：变化位置（目标色 / 非目标色）× 12 试次',
    improvement: '把「变化盲」做成注意集操纵：全程只监测蓝色方块，变化随机落在目标色或非目标色物体上。',
    prediction: '目标色条件检测更快、更准（RT 更短，正确率更高）；若注意集不起作用，两条件应无差异。',

    intro:
      '<p>屏幕中央会出现 <b>24 个彩色方块</b>。画面会<b>反复闪烁</b>（画面 → 空白 → 画面），' +
      '其中有一次闪烁时，<b>某一个方块的位置会轻微移动</b>。</p>' +
      '<p>你的任务：判断这次变化发生在<b style="color:#2f6fed">蓝色</b>方块上，还是<b>其他颜色</b>的方块上。</p>' +
      '<ul>' +
      '<li>变化一定存在，且只发生在一个方块上（位置轻微偏移）。</li>' +
      '<li>看到变化后尽快作答：<kbd>F</kbd> = 变化在<b>蓝色</b>方块上；<kbd>J</kbd> = 变化<b>不在</b>蓝色方块上。' +
      '手机上可直接点按钮。</li>' +
      '<li>单试次最长 15 秒；若一直没看出来会自动进入下一试次。</li>' +
      '</ul>' +
      '<p class="dim">先做 6 个练习试次（有对错反馈），再进入正式实验。练习数据不计入分析。</p>' +

      '<h3>这个实验的改进点</h3>' +
      '<p>经典闪烁范式只问「有没有变化」。本研究把<b>注意集</b>写进程序：被试全程只盯蓝色方块，' +
      '而变化的物体一半是蓝色、一半不是。这样就能检验：<b>与当前注意定势不一致的变化，是不是真的更难被看见</b>。' +
      '这是对 Rensink 等（1997）"注意是看见变化的前提"的直接操作化检验，参照 Most 等（2001）关于注意定势的发现。</p>',

    start: function (ctx) {
      var canvas = A.el('canvas', { class: 'canvas', width: GEO.W, height: GEO.H });
      ctx.setStage([canvas]);

      var practice = [];
      for (var i = 0; i < 6; i++) practice.push(buildStimulus(i % 2 ? 'outset' : 'inset'));
      practice = A.shuffle(practice);

      var formal = [];
      for (var j = 0; j < 12; j++) formal.push(buildStimulus('inset'));
      for (var k = 0; k < 12; k++) formal.push(buildStimulus('outset'));
      formal = A.shuffle(formal);

      return ctx.pause('<div class="big-msg">练习阶段</div>' +
        '<p class="dim">6 个试次，有对错反馈。准备好后点「开始练习」。</p>', '开始练习')
        .then(function () {
          return ctx.runTrials(practice, function (t, i, c) {
            return runTrial(t, c, canvas, true);
          });
        })
        .then(function () {
          return ctx.pause('<div class="big-msg">练习结束</div>' +
            '<p class="dim">接下来是 24 个正式试次，<b>没有对错反馈</b>，请保持同样的判断标准。<br>' +
            '中途不要切换窗口或看手机。</p>', '进入正式实验');
        })
        .then(function () {
          return ctx.runTrials(formal, function (t, i, c) {
            return runTrial(t, c, canvas, false);
          });
        })
        .then(function (results) {
          ctx.hint('');
          return ctx.finish(results);
        });
    }
  });
})();
