/**
 * app.js —— 界面装配与主流程
 * ---------------------------------------------------------------------------
 * 把所有模块串起来：
 *   ① 用 config.js 里的场景定义渲染「任务简报」页（信号/噪音定义、四种结果、参数设置）
 *   ② 步骤导航（简报 → 任务 → 结果 → 概念实验室）
 *   ③ 启动 Engine 跑实验，把 hooks 接到声呐渲染器与界面提示上
 *   ④ 一局结束 → summarize → results.render，并把本局存入历史用于多局对比
 *   ⑤ 键盘作答（F = 有目标，J = 无目标）、导出 CSV、窗口缩放重绘
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;
  const CFG = SDT.config;
  const S = CFG.SCENARIO;

  const STORAGE_KEY = 'sdt-sonar-lab.history.v1';

  /* =======================================================================
   * 全局状态
   * ===================================================================== */
  const app = {
    step: 'brief',
    engine: null,
    renderer: null,
    lastStats: null,
    history: loadHistory()
  };

  /* =======================================================================
   * 历史记录（多局对比）
   * ===================================================================== */
  function loadHistory() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      // file:// 或隐私模式下 localStorage 可能不可用，退化为内存存储
      return [];
    }
  }

  function saveHistory() {
    try {
      // 只存汇总量，不存逐试次明细，避免超出存储配额
      const slim = app.history.slice(-30).map(function (h) {
        return {
          meta: h.meta, counts: h.counts, n: h.n, rates: h.rates,
          pH: h.pH, pFA: h.pFA, dprime: h.dprime, c: h.c, beta: h.beta,
          accuracy: h.accuracy, aPrime: h.aPrime, auc: h.auc,
          majorityBaseline: h.majorityBaseline, accuracyGain: h.accuracyGain,
          rtMean: h.rtMean, corrected: h.corrected, warnings: [], notes: []
        };
      });
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (e) { /* 忽略：不影响主流程 */ }
  }

  /* =======================================================================
   * 步骤导航
   * ===================================================================== */
  function goStep(step) {
    if (app.step === 'task' && step !== 'task') {
      // 离开任务页时终止正在进行的实验
      if (app.engine && !app.engine.isDone()) app.engine.abort();
    }
    app.step = step;

    U.$$('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + step);
    });
    U.$$('.step').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-step') === step);
    });
    global.scrollTo({ top: 0, behavior: 'smooth' });

    // 切到需要绘图的视图时，等布局稳定后重绘
    requestAnimationFrame(function () {
      if (step === 'concept') SDT.concept.refresh();
      if (step === 'result' && app.lastStats) {
        SDT.results.render(app.lastStats, app.history);
      }
      if (step === 'task' && app.renderer) app.renderer.resize();
    });
  }

  /* =======================================================================
   * 一、渲染「任务简报」页
   * ===================================================================== */
  function renderBrief() {
    // ---- 开场导语 ----
    U.$('#heroLead').textContent = S.briefing;

    // ---- 信号 / 噪音定义 ----
    const defHtml = function (item, kind) {
      return '' +
        '<div class="def def--' + kind + '">' +
        '<div class="def__badge">' + (kind === 'signal' ? 'S' : 'N') + '</div>' +
        '<div class="def__body">' +
        '<h4>' + U.escapeHtml(item.label) + '<em>' + U.escapeHtml(item.short) + '</em></h4>' +
        '<p>' + U.bold(U.escapeHtml(item.desc)) + '</p>' +
        '<div class="def__visual"><span>视觉特征</span>' + U.escapeHtml(item.visual) + '</div>' +
        '</div></div>';
    };
    U.$('#signalDef').innerHTML = defHtml(S.signal, 'signal');
    U.$('#noiseDef').innerHTML = defHtml(S.noise, 'noise');

    // ---- 四种结果 ----
    U.$('#outcomeGrid').innerHTML = ['hit', 'miss', 'fa', 'cr'].map(function (key) {
      const o = S.outcomes[key];
      return '' +
        '<div class="oc oc--' + key + '">' +
        '<div class="oc__top"><span class="oc__code">' + o.code + '</span>' +
        '<span class="oc__name">' + o.name + '</span>' +
        '<span class="oc__en">' + o.en + '</span></div>' +
        '<div class="oc__states">' + o.states + '</div>' +
        '<p class="oc__cons">' + U.escapeHtml(o.consequence) + '</p>' +
        '</div>';
    }).join('');

    // ---- 操作说明 ----
    U.$('#instructionList').innerHTML = S.instructions.map(function (t) {
      return '<li>' + U.bold(U.escapeHtml(t)) + '</li>';
    }).join('');

    // ---- 参数预设 ----
    U.$('#presetRow').innerHTML = CFG.PRESETS.map(function (p, i) {
      return '<button type="button" class="preset" data-preset="' + p.id + '">' +
        '<strong>' + U.escapeHtml(p.name) + '</strong>' +
        '<span>' + U.escapeHtml(p.desc) + '</span>' +
        '</button>';
    }).join('');

    U.$$('.preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const p = CFG.PRESETS.filter(function (x) { return x.id === btn.getAttribute('data-preset'); })[0];
        if (!p) return;
        applyParams(p.params);
        U.$$('.preset').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
    });

    // ---- 滑块 ----
    bindSlider('#briefPrior', '#briefPriorVal', function (v) { return U.pct(v, 0); });
    bindSlider('#briefDp', '#briefDpVal', function (v) { return v.toFixed(1); });
    bindSlider('#briefTrials', '#briefTrialsVal', function (v) { return v + ' 试次'; });
    bindSlider('#briefObserve', '#briefObserveVal', function (v) { return (v / 1000).toFixed(1) + ' s'; });

    applyParams(CFG.DEFAULTS);
    U.$$('.preset')[0].classList.add('is-active');

    // ---- 开始按钮 ----
    U.$('#btnStart').addEventListener('click', startExperiment);

    // 允许在简报页回车直接开始
    document.addEventListener('keydown', function (e) {
      if (app.step === 'brief' && e.key === 'Enter' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        startExperiment();
      }
    });
  }

  function bindSlider(sliderSel, labelSel, fmt) {
    const slider = U.$(sliderSel);
    const label = U.$(labelSel);
    if (!slider) return;
    const update = function () { label.textContent = fmt(parseFloat(slider.value)); };
    slider.addEventListener('input', update);
    update();
  }

  function applyParams(params) {
    U.$('#briefPrior').value = params.priorP;
    U.$('#briefDp').value = params.dprime;
    U.$('#briefTrials').value = params.trials;
    U.$('#briefObserve').value = params.observeMs;
    ['#briefPrior', '#briefDp', '#briefTrials', '#briefObserve'].forEach(function (sel, i) {
      U.$(sel).dispatchEvent(new Event('input'));
    });
    U.$('#briefFeedback').checked = !!params.feedback;
  }

  function readParams() {
    return {
      priorP: parseFloat(U.$('#briefPrior').value),
      dprime: parseFloat(U.$('#briefDp').value),
      trials: parseInt(U.$('#briefTrials').value, 10),
      observeMs: parseInt(U.$('#briefObserve').value, 10),
      feedback: U.$('#briefFeedback').checked,
      seed: null
    };
  }

  /* =======================================================================
   * 二、跑实验
   * ===================================================================== */
  function startExperiment() {
    const params = readParams();

    goStep('task');

    // 等 DOM 可见后再初始化渲染器，否则量不到画布尺寸
    requestAnimationFrame(function () {
      const canvas = U.$('#sonarCanvas');
      app.renderer = SDT.sonar.createRenderer(canvas);
      app.renderer.resize();
      app.renderer.drawIdle('准备就绪…');

      // HUD 参数回显
      U.$('#hudPrior').textContent = U.pct(params.priorP, 0);
      U.$('#hudDp').textContent = params.dprime.toFixed(1);
      U.$('#hudObserve').textContent = (params.observeMs / 1000).toFixed(1) + 's';

      setButtonsEnabled(false);
      setBanner('准备中…', 'muted');

      app.engine = new SDT.Engine(params, {
        onTrialStart: function (info) {
          U.$('#hudTrial').textContent = (info.index + 1) + ' / ' + info.total;
          U.$('#timerFill').style.width = '0%';
          setButtonsEnabled(false);
          setBanner('第 ' + (info.index + 1) + ' 试次 · 准备', 'ready');
          app.renderer.drawIdle('第 ' + (info.index + 1) + ' / ' + info.total + ' 试次');
        },
        onReveal: function (cols, progress, scanline) {
          if (!app.engine.current) return;
          app.renderer.draw(app.engine.current.stim, cols, { scanline: !!scanline });
          U.$('#timerFill').style.width = (progress * 100).toFixed(1) + '%';
        },
        onJudgeOpen: function () {
          setButtonsEnabled(true);
          setBanner('扫描结束 · 请判断', 'judge');
        },
        onAnswer: function (info) {
          setButtonsEnabled(false);
        },
        onFeedback: function (info) {
          setBanner(info.correct ? '✓ 判断正确' : '✗ 判断错误', info.correct ? 'good' : 'bad');
        },
        onFinish: function (trials, meta) {
          finishExperiment(trials, meta);
        }
      });

      app.engine.start();
    });
  }

  function finishExperiment(trials, meta) {
    const stats = SDT.sdt.summarize(trials, meta);
    app.lastStats = stats;
    app.history.push(stats);
    saveHistory();

    // 结果页顶部概要
    U.$('#resultMeta').innerHTML =
      '<span>先验 P(S) <b>' + U.pct(meta.priorP, 0) + '</b></span>' +
      '<span>设计 d′ <b>' + meta.dprime.toFixed(1) + '</b></span>' +
      '<span>试次 <b>' + stats.n + '</b></span>' +
      '<span>观察时长 <b>' + (meta.observeMs / 1000).toFixed(1) + 's</b></span>' +
      '<span>随机种子 <b>' + meta.seed + '</b></span>';

    SDT.results.render(stats, app.history);
    if (app.updateStepAvailability) app.updateStepAvailability();
    goStep('result');
  }

  /* ---- 任务页的小工具 ---- */
  function setButtonsEnabled(on) {
    [U.$('#btnYes'), U.$('#btnNo')].forEach(function (b) {
      if (b) b.disabled = !on;
    });
  }

  function setBanner(text, tone) {
    const b = U.$('#taskBanner');
    if (!b) return;
    b.textContent = text;
    b.className = 'task-banner task-banner--' + (tone || 'muted');
  }

  function respond(answer) {
    if (!app.engine) return;
    if (!app.engine.answer(answer)) {
      // 扫描未结束时的按键：给一个温和提示
      setBanner('扫描进行中，请等扫描结束再作答', 'warn');
    }
  }

  /* =======================================================================
   * 三、事件绑定
   * ===================================================================== */
  function bindGlobal() {
    // 步骤按钮
    const resultStepBtn = U.$$('.step').filter(function (b) {
      return b.getAttribute('data-step') === 'result';
    })[0];

    /** 没有本局结果时，把"结果分析"步骤置为不可点 */
    function updateStepAvailability() {
      if (!resultStepBtn) return;
      const has = !!app.lastStats;
      resultStepBtn.disabled = !has;
      resultStepBtn.title = has ? '查看本局结果' : '先完成一局实验才能查看结果';
    }
    updateStepAvailability();
    app.updateStepAvailability = updateStepAvailability;

    U.$$('.step').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const step = btn.getAttribute('data-step');

        if (step === 'task') {
          // 已有结果或没有会话时，"检测任务"表示"再跑一局"；正在跑则只切换视图
          if (!app.engine || app.engine.isDone()) {
            startExperiment();
          } else {
            goStep('task');
          }
          return;
        }
        goStep(step);
      });
    });

    // 作答按钮
    if (U.$('#btnYes')) U.$('#btnYes').addEventListener('click', function () { respond('signal'); });
    if (U.$('#btnNo')) U.$('#btnNo').addEventListener('click', function () { respond('noise'); });

    // 键盘作答
    document.addEventListener('keydown', function (e) {
      if (app.step !== 'task') return;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'f' || k === 'arrowleft' || k === '1') { e.preventDefault(); respond('signal'); }
      else if (k === 'j' || k === 'arrowright' || k === '2') { e.preventDefault(); respond('noise'); }
    });

    // 结果页按钮
    if (U.$('#btnRedo')) {
      U.$('#btnRedo').addEventListener('click', startExperiment);
    }
    if (U.$('#btnRetune')) {
      U.$('#btnRetune').addEventListener('click', function () { goStep('brief'); });
    }
    if (U.$('#btnExport')) {
      U.$('#btnExport').addEventListener('click', function () {
        if (app.lastStats) SDT.results.exportCsv(app.lastStats.trialList, app.lastStats);
      });
    }
    if (U.$('#btnClearHistory')) {
      U.$('#btnClearHistory').addEventListener('click', function () {
        app.history = [];
        saveHistory();
        if (U.$('#historyTableBody')) SDT.results.renderHistory(U.$('#historyTableBody'), []);
        if (app.lastStats) SDT.results.render(app.lastStats, []);
      });
    }

    // 概念实验室
    SDT.concept.init();

    // 窗口尺寸变化时重绘所有画布
    let resizeTimer = null;
    global.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (app.renderer && app.step === 'task') app.renderer.resize();
        if (app.lastStats && app.step === 'result') SDT.results.render(app.lastStats, app.history);
        if (app.step === 'concept') SDT.concept.refresh();
      }, 160);
    });
  }

  /* =======================================================================
   * 启动
   * ===================================================================== */
  function boot() {
    renderBrief();
    bindGlobal();
    if (U.$('#historyTableBody')) SDT.results.renderHistory(U.$('#historyTableBody'), app.history);
    goStep('brief');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  SDT.app = app;
})(window);
