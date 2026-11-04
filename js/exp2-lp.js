/* ============================================================
 * exp2-lp.js —— 实验二：低流行率视觉搜索（Low-Prevalence Effect）
 *
 * 复现：Wolfe et al. (2005) 的"低流行率"效应
 *       目标出现概率越低，观察者在目标真的出现时越容易漏掉（漏报率↑）。
 *
 * 改进（自选新条件）：即时反馈 = 虚拟目标机制
 *       低流行率条件下，每试次结束后明确告知"本试次有没有目标"，
 *       相当于用反馈把被试的判断标准拉回来。
 *       依据 Wolfe 等的建议：低流行率下的漏报是"标准漂移"，不是"看不见"。
 *
 * 设计：单因素被试内三水平
 *       high   目标出现率 50%（基线，无反馈）
 *       low    目标出现率 10%（无反馈）
 *       lowfb  目标出现率 10% + 每试次即时反馈
 * 每条件 30 试次。
 *
 * 因变量：漏报率、虚报率、d'、判断标准 c
 * 预测：low 的漏报率 > high（复现低流行率效应）；
 *       lowfb 的漏报率 < low，c 向 high 靠拢（改进生效）。
 * ============================================================ */

(function () {
  'use strict';

  var A = window.ALAB;

  var GEO = { W: 480, H: 480, N: 5, SP: 92, OFF: 46, SIZE: 30 };
  var RT_LIMIT = 4000;
  var ANGLES = [0, 90, 180, 270];

  /* ---------------- 刺激绘制 ----------------
   * 经典 T-among-L 搜索：目标是一个「T」，干扰项全是「L」，
   * 两者都可以随机旋转。区别在结构而非朝向：
   *   T = 横杠居中压在竖杆顶端
   *   L = 横杠与竖杆在端点处相接（转角）
   * 这样指导语可以唯一界定目标（"找字母 T"），也保证搜索是串行的、
   * 不会因为"竖线朝上"这种单一特征而自动弹出。
   */

  function drawItem(g, x, y, angleDeg, shape, size) {
    var rad = angleDeg * Math.PI / 180;
    var half = size / 2;
    g.save();
    g.translate(x, y);
    g.rotate(rad);
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#1a1a1a';
    g.beginPath();
    if (shape === 'T') {
      g.moveTo(-half, -half); g.lineTo(half, -half);   // 横杠
      g.moveTo(0, -half); g.lineTo(0, half);           // 竖杆，居中
    } else {
      g.moveTo(-half, -half); g.lineTo(-half, half);   // 竖杆
      g.lineTo(half, half);                            // 横杠，在端点
    }
    g.stroke();
    g.restore();
  }

  function makeItems(present) {
    var items = [];
    for (var r = 0; r < GEO.N; r++) {
      for (var c = 0; c < GEO.N; c++) {
        items.push({
          x: GEO.OFF + c * GEO.SP + A.rand(-5, 5),
          y: GEO.OFF + r * GEO.SP + A.rand(-5, 5),
          angle: A.choice(ANGLES),
          shape: 'L'
        });
      }
    }
    if (present) {
      var i = A.randInt(0, items.length - 1);
      items[i].shape = 'T';
      items[i].angle = A.choice(ANGLES);
    }
    return items;
  }

  function drawField(g, items) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, GEO.W, GEO.H);
    items.forEach(function (it) { drawItem(g, it.x, it.y, it.angle, it.shape, GEO.SIZE); });
  }

  /* ---------------- 试次 ---------------- */

  async function runTrial(trial, ctx, canvas) {
    var g = canvas.getContext('2d');
    var items = makeItems(trial.present === 1);
    drawField(g, items);

    ctx.hint('存在字母 <b>T</b> 吗？<kbd>F</kbd> = 有，<kbd>J</kbd> = 无');

    var t0 = performance.now();
    var r = await ctx.waitResponse(['f', 'j'], ['有目标', '无目标'], RT_LIMIT, t0);

    var resp = r.timeout ? 'none' : (r.key === 'f' ? 'yes' : 'no');
    var correct = !r.timeout &&
      ((resp === 'yes') === (trial.present === 1));

    var rec = {
      cond: trial.cond,
      present: trial.present,
      resp: resp,
      rt: r.timeout ? null : Math.round(r.rt),
      correct: correct,
      timeout: r.timeout ? 1 : 0
    };

    if (trial.feedback) {
      var truth = trial.present === 1 ? '本试次<b>有</b>目标' : '本试次<b>无</b>目标';
      await ctx.feedback((correct ? '✔ 正确 · ' : '✘ 错误 · ') + truth,
                         correct, 1100);
    } else {
      await A.sleep(260);
    }
    return rec;
  }

  /* ---------------- 组块 ---------------- */

  function buildBlock(cond, n, presentRate, withFeedback) {
    var nPresent = Math.round(n * presentRate);
    var trials = [];
    for (var i = 0; i < nPresent; i++) {
      trials.push({ cond: cond, present: 1, feedback: withFeedback });
    }
    for (var j = 0; j < n - nPresent; j++) {
      trials.push({ cond: cond, present: 0, feedback: withFeedback });
    }
    return A.shuffle(trials);
  }

  var COND_LABEL = {
    high: '高流行率（50%）',
    low: '低流行率（10%）',
    lowfb: '低流行率（10%）+ 即时反馈'
  };

  A.register({
    id: 'lp',
    week: 'W6',
    title: '低流行率视觉搜索',
    ref: 'Wolfe, Horowitz & Kenner (2005). Rare items often missed in visual searches. Nature.',
    minutes: '约 7 分钟',
    trialsText: '练习 12 + 正式 90（每条件 30）',

    design: '单因素被试内三水平：high(50%) / low(10%) / lowfb(10%+反馈)',
    improvement: '在低流行率条件下加入"虚拟目标式即时反馈"，检验漏报是由"看不见"还是"标准漂移"造成。',
    prediction: 'low 的漏报率显著高于 high；加入反馈后漏报率回落、c 变宽松（向 high 靠拢）。',

    intro:
      '<p>屏幕上会出现 <b>25 个字母</b>：绝大多数是 <b>L</b>，个别是 <b>T</b>。字母可以任意旋转（上下左右都可能）。</p>' +
      '<p>你的任务：判断这一屏里有没有字母 <b>T</b>。</p>' +
      '<ul>' +
      '<li>有 T：按 <kbd>F</kbd>；没有 T：按 <kbd>J</kbd>（手机上点按钮）。</li>' +
      '<li>每个试次最多 4 秒，请又快又准。</li>' +
      '<li>T <b>不是</b>每个试次都有——有的组块里很常见，有的组块里很罕见，' +
      '请按你真实的判断作答，不要因为"大概不会出现"就一律说没有。</li>' +
      '</ul>' +

      '<h3>怎么区分 T 和 L</h3>' +
      '<p>看<b>横杠和竖杆相接的位置</b>：T 的横杠压在竖杆<b>中间</b>（像飞机机翼），' +
      'L 的横杠与竖杆在<b>端点</b>相接（像直角）。字母怎么转，这个结构关系都不变。</p>' +

      '<p class="dim">共 3 个组块、每组 30 试次，组块之间可以休息。练习有对错反馈，正式试次中只有第三个组块有反馈。</p>' +

      '<h3>这个实验的改进点</h3>' +
      '<p>Wolfe 等（2005）发现：目标越罕见，人在它真的出现时越容易漏掉——而且这主要不是"看不见"，' +
      '而是<b>判断标准被先验概率拉偏了</b>（少见 → 默认"没有"）。' +
      '本研究把这个解释变成可检验的干预：在低流行率组块里，<b>每试次都告诉被试他刚才对不对、本试次到底有没有目标</b>' +
      '（虚拟目标机制的简化版）。如果漏报真的源于标准漂移，反馈应当把漏报率压下来、把 c 推向 0；' +
      '如果漏报源于知觉本身受限，反馈就不该有用。</p>',

    start: async function (ctx) {
      var canvas = A.el('canvas', { class: 'canvas', width: GEO.W, height: GEO.H });
      ctx.setStage([canvas]);

      /* --- 练习：高流行率 + 反馈，让被试学会辨认目标 --- */
      var practice = buildBlock('practice', 12, 0.5, true).map(function (t) {
        t.feedback = true;
        return t;
      });

      await ctx.pause(
        '<div class="big-msg">练习阶段</div>' +
        '<p class="dim">12 个试次。目标 = 字母 <b>T</b>（横杠压在竖杆中间）。<br>' +
        '每个试次都会告诉你对错。</p>', '开始练习');

      await ctx.runTrials(practice, function (t, i, c) {
        return runTrial(t, c, canvas);
      });

      /* --- 正式：三个组块，顺序随机（平衡顺序效应） --- */
      var blocks = [
        { cond: 'high', n: 30, rate: 0.5, fb: false },
        { cond: 'low', n: 30, rate: 0.1, fb: false },
        { cond: 'lowfb', n: 30, rate: 0.1, fb: true }
      ];
      blocks = A.shuffle(blocks);

      await ctx.pause(
        '<div class="big-msg">练习结束</div>' +
        '<p class="dim">接下来 3 个组块，共 90 个试次，约 5 分钟。' +
        '不同组块里目标出现的频率不同，请始终按真实判断作答。<br>中途不要切换窗口。</p>',
        '进入正式实验');

      var all = [];
      for (var b = 0; b < blocks.length; b++) {
        var blk = blocks[b];
        if (b > 0) {
          await ctx.pause(
            '<div class="big-msg">第 ' + (b + 1) + ' / 3 组</div>' +
            '<p class="dim">' + COND_LABEL[blk.cond] + '，共 30 试次。<br>' +
            '准备好了就继续。</p>', '继续');
        }
        var trials = buildBlock(blk.cond, blk.n, blk.rate, blk.fb);
        var res = await ctx.runTrials(trials, function (t, i, c) {
          return runTrial(t, c, canvas);
        });
        all = all.concat(res);
      }

      ctx.hint('');
      await ctx.finish(all);
    }
  });
})();
