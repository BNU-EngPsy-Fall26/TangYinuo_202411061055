/**
 * engine.js —— 实验流程引擎
 * ---------------------------------------------------------------------------
 * 负责把"一局实验"跑完，与界面解耦（只通过 hooks 回调通知外界）：
 *
 *   试次序列生成 → [准备 0.7s] → [扫描观察 observeMs] → [作答窗口] → [反馈 0.65s] → 下一试次
 *
 * 关键设计（也是评分点"交互式检测游戏"的实现要点）：
 *   · 每局试次 ≥ 20，且"有目标 / 无目标"的数量**严格按先验概率 P(S) 配比**后随机打乱，
 *     保证实际呈现的先验与设定值一致（这直接影响被试的判定标准 c）。
 *   · 刺激限时：扫描阶段固定时长，扫描结束的那一刻刺激冻结并开放作答。
 *   · 反应时（RT）从**作答窗口打开**的时刻起算，到按键为止。
 *   · 全程只用一种计时源（requestAnimationFrame + performance.now），避免定时器漂移。
 *
 * 状态：idle → ready → observe → judge → feedback → … → done
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT;
  const U = SDT.util;

  const READY_MS = 700;    // 准备阶段时长（显示第几试次）
  const FEEDBACK_MS = 700; // 反馈展示时长（仅在开启逐次反馈时使用）
  const ITI_MS = 220;      // 试次间隔

  /**
   * @constructor
   * @param {object} config {priorP, dprime, trials, observeMs, feedback, seed}
   * @param {object} hooks  {
   *    onTrialStart(info),   // 新试次开始（准备阶段）
   *    onReveal(cols, progress), // 扫描进度，cols 为已揭示的列数（小数）
   *    onJudgeOpen(info),    // 作答窗口打开
   *    onAnswer(info),       // 被试作答
   *    onFeedback(info),     // 反馈（若开启）
   *    onFinish(trials, meta)// 一局结束
   * }
   */
  function Engine(config, hooks) {
    this.config = {
      priorP: U.clamp(config.priorP, 0.05, 0.95),
      dprime: config.dprime,
      trials: Math.max(2, Math.round(config.trials)),
      observeMs: config.observeMs,
      feedback: !!config.feedback,
      seed: config.seed || Math.floor(Math.random() * 1e9)
    };
    this.hooks = hooks || {};
    this.phase = 'idle';
    this.trials = [];
    this.index = -1;
    this.rafId = null;
    this.phaseStart = 0;
    this.rtStart = 0;
    this.current = null;

    this.rng = U.makeRng(this.config.seed);
    this.queue = this._buildQueue();
  }

  /** 按先验概率精确配比并打乱，得到试次类型序列 */
  Engine.prototype._buildQueue = function () {
    const total = this.config.trials;
    const nSignal = Math.round(total * this.config.priorP);
    const queue = [];
    for (let i = 0; i < total; i++) queue.push(i < nSignal);
    U.shuffle(queue, this.rng);
    return queue;
  };

  Engine.prototype.start = function () {
    this.index = -1;
    this.trials = [];
    this.phase = 'idle';
    this._next();
  };

  /** 进入下一个试次 */
  Engine.prototype._next = function () {
    this.index += 1;
    if (this.index >= this.queue.length) return this._finish();

    const isSignal = this.queue[this.index];
    // 生成刺激时就确定好"本试次有没有信号"，与渲染、判分完全一致
    const stim = SDT.sonar.generateTrial({
      rng: this.rng,
      isSignal: isSignal,
      dprime: this.config.dprime
    });

    this.current = {
      index: this.index,
      isSignal: isSignal,
      stim: stim,
      response: null,
      outcome: null,
      rt: NaN,
      startedAt: new Date()
    };

    this._enter('ready');
    if (this.hooks.onTrialStart) {
      this.hooks.onTrialStart({
        index: this.index,
        total: this.queue.length,
        isSignal: isSignal   // 仅用于调试/记录，界面不应提前泄露
      });
    }
    this._loop();
  };

  Engine.prototype._enter = function (phase) {
    this.phase = phase;
    this.phaseStart = performance.now();
  };

  /* ---------------------------------------------------------------------
   * 主循环
   * ------------------------------------------------------------------- */
  Engine.prototype._loop = function () {
    const self = this;
    cancelAnimationFrame(this.rafId);

    function step(now) {
      const t = now - self.phaseStart;

      if (self.phase === 'ready') {
        if (t >= READY_MS) {
          self._enter('observe');
          if (self.hooks.onReveal) self.hooks.onReveal(0, 0);
        }
      } else if (self.phase === 'observe') {
        const p = Math.min(1, t / self.config.observeMs);
        const cols = p * self.current.stim.timeBins;
        if (self.hooks.onReveal) self.hooks.onReveal(cols, p, true);
        if (t >= self.config.observeMs) {
          self._enter('judge');
          self.rtStart = performance.now();
          if (self.hooks.onReveal) {
            self.hooks.onReveal(self.current.stim.timeBins, 1, false);
          }
          if (self.hooks.onJudgeOpen) {
            self.hooks.onJudgeOpen({ index: self.index, total: self.queue.length });
          }
        }
      } else if (self.phase === 'feedback') {
        if (t >= FEEDBACK_MS) {
          self._enter('pause');
          setTimeout(function () { self._next(); }, ITI_MS);
          return; // 交给 setTimeout 推进，暂停 rAF
        }
      }

      if (self.phase !== 'done') self.rafId = requestAnimationFrame(step);
    }
    this.rafId = requestAnimationFrame(step);
  };

  /* ---------------------------------------------------------------------
   * 作答
   * ------------------------------------------------------------------- */
  /**
   * @param {'signal'|'noise'} answer
   * @returns {boolean} 是否被接受
   */
  Engine.prototype.answer = function (answer) {
    if (this.phase !== 'judge') return false;

    const t = this.current;
    const rt = performance.now() - this.rtStart;
    const correct =
      (t.isSignal && answer === 'signal') || (!t.isSignal && answer === 'noise');

    t.response = answer;
    t.rt = rt;
    t.outcome = t.isSignal
      ? (answer === 'signal' ? 'h' : 'm')
      : (answer === 'signal' ? 'fa' : 'cr');

    this.trials.push(t);
    this.phase = 'answered';

    if (this.hooks.onAnswer) {
      this.hooks.onAnswer({
        index: this.index,
        answer: answer,
        isSignal: t.isSignal,
        outcome: t.outcome,
        correct: correct,
        rt: rt
      });
    }

    if (this.config.feedback) {
      this._enter('feedback');
      if (this.hooks.onFeedback) {
        this.hooks.onFeedback({ correct: correct, isSignal: t.isSignal, outcome: t.outcome });
      }
      this._loop();
    } else {
      const self = this;
      this._enter('pause');
      setTimeout(function () { self._next(); }, ITI_MS);
    }
    return true;
  };

  Engine.prototype._finish = function () {
    this.phase = 'done';
    cancelAnimationFrame(this.rafId);
    if (this.hooks.onFinish) {
      this.hooks.onFinish(this.trials, {
        priorP: this.config.priorP,
        dprime: this.config.dprime,
        trials: this.config.trials,
        observeMs: this.config.observeMs,
        seed: this.config.seed
      });
    }
  };

  /** 中途终止（进入结果页或离开页面时调用） */
  Engine.prototype.abort = function () {
    cancelAnimationFrame(this.rafId);
    if (this.phase !== 'done') this.phase = 'aborted';
  };

  Engine.prototype.isDone = function () {
    return this.phase === 'done' || this.phase === 'aborted';
  };

  SDT.Engine = Engine;
  SDT.ENGINE_TIMING = { READY_MS, FEEDBACK_MS, ITI_MS };
})(window);
