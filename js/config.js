/**
 * config.js —— 场景与参数定义
 * ---------------------------------------------------------------------------
 * 本文件只做一件事：把「实验场景」与「可调参数」集中定义清楚。
 * 信号检测论（Signal Detection Theory, SDT）实验的三个前提，全部在这里显式声明：
 *   1. 什么是信号（Signal）、什么是噪音（Noise）；
 *   2. 信号的先验概率 P(S)；
 *   3. 四种判断结果（击中 / 漏报 / 误报 / 正确排除）在**本场景中的实际含义与代价**。
 * 其余模块（引擎、渲染、统计）都从这里读取配置，不写死任何数值。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT || (global.SDT = {});

  /* =======================================================================
   * 一、场景设定：深海声呐 · 目标检测
   * ===================================================================== */
  const SCENARIO = {
    id: 'sonar',
    name: '深海声呐',
    fullName: '深海声呐 · 水下目标检测',
    role: '远洋调查船 · 声呐操作员',
    era: '当代 · 深海搜索任务',
    tagline: '在瀑布图上，从一片海洋噪声里找出那条可疑的亮线。',

    /** 开场情境文案（第一人称，营造代入感） */
    briefing:
      '你是一艘远洋搜索船的声呐操作员。任务海域水声环境复杂：海况、过往船只与海洋生物' +
      '都会在听音器上留下痕迹。你要盯着声呐瀑布图，判断这一小段记录里「到底有没有目标回波」。' +
      '报得太随意，搜索队会一次次白跑；漏得太多，可能永远错过目标。',

    /* ---- 信号与噪音的操作性定义 ---- */
    signal: {
      key: 'signal',
      label: '目标回波',
      short: '信号 S',
      icon: 'target',
      color: 'cyan',
      desc:
        '水下目标（失事潜航器 / 声学信标）反射或主动发出的**窄带线谱**。' +
        '它是「有组织」的能量：在瀑布图上表现为一条沿时间方向连续延伸的亮线，' +
        '占据固定的频率位置，强度在一段时间内保持稳定。',
      visual: '沿时间连续的窄亮线（频率位置固定）'
    },

    noise: {
      key: 'noise',
      label: '海洋环境噪声',
      short: '噪音 N',
      icon: 'wave',
      color: 'slate',
      desc:
        '海面风浪、船运、降水与生物活动共同形成的背景。它是「无组织」的能量：' +
        '在瀑布图上表现为随机散斑，偶发短促的宽频爆发（虾群、鲸歌），' +
        '不会在某个频率上长时间连成一条线。',
      visual: '随机散斑 + 偶发宽频爆发（不连续）'
    },

    /* ---- 四种结果的实际含义（本场景的"后果"）---- */
    outcomes: {
      hit: {
        code: 'H',
        cell: 'hit',
        name: '击中',
        states: '有目标 → 报「有」',
        en: 'Hit',
        consequence: '搜索队第一时间出动，成功捕获目标回波 → 任务推进。',
        good: true
      },
      miss: {
        code: 'M',
        cell: 'miss',
        name: '漏报',
        states: '有目标 → 报「无」',
        en: 'Miss',
        consequence: '目标就在那里，却被当作噪声放过 → 错过最佳搜索窗口，代价最高。',
        good: false
      },
      fa: {
        code: 'FA',
        cell: 'fa',
        name: '误报',
        states: '无目标 → 报「有」',
        en: 'False Alarm',
        consequence: '搜索队扑空，消耗燃油与航时 → 资源浪费，但不会错过目标。',
        good: false
      },
      cr: {
        code: 'CR',
        cell: 'cr',
        name: '正确排除',
        states: '无目标 → 报「无」',
        en: 'Correct Rejection',
        consequence: '准确判断为噪声，船按计划继续巡航 → 效率最优。',
        good: true
      }
    },

    /**
     * 支付矩阵（相对价值，单位可视为"分值"）：
     * 用于计算"理想观察者"的最优判定标准 c_opt / β_opt。
     * 默认取值体现本场景的核心张力：漏报的代价远高于误报。
     */
    payoff: { vH: 10, vCR: 2, vFA: -4, vM: -20 },

    /** 任务操作说明 */
    instructions: [
      '每个试次，声呐会扫出一条新的瀑布图记录（约 2.5 秒）。',
      '扫描结束后，判断这段记录里**有没有**目标回波，按「有目标」或「无目标」作答。',
      '键盘也可以作答：F 键 = 有目标，J 键 = 无目标。',
      '扫描进行中不能作答；扫描结束的那一刻才开始计时。',
      '整局结束后，系统会自动统计混淆矩阵并计算 d′、c、β、ROC 等指标。'
    ]
  };

  /* =======================================================================
   * 二、可调参数（实验的开始界面会把这些暴露给用户）
   * ===================================================================== */

  /** 先验概率 P(S) 的可选档位 */
  const PRIOR_LEVELS = [0.2, 0.3, 0.5, 0.7, 0.8];

  /** 难度档位：设计 d′（信号强度） */
  const DIFFICULTY_LEVELS = [
    { label: '极难', dprime: 0.6, note: '线谱几乎淹没在噪声里' },
    { label: '偏难', dprime: 1.0, note: '需要仔细沿时间方向追踪' },
    { label: '中等', dprime: 1.5, note: '训练场景的默认难度' },
    { label: '偏易', dprime: 2.2, note: '线谱轮廓可辨' },
    { label: '容易', dprime: 3.0, note: '一眼可见' }
  ];

  /** 每局试次数的可选档位（作业要求每局 ≥ 20 试次） */
  const TRIAL_LEVELS = [20, 30, 40, 50, 60];

  /** 单次观察时长（瀑布图扫描时长）的档位，单位毫秒 */
  const OBSERVE_LEVELS = [1500, 2500, 4000];

  /** 全局默认参数 */
  const DEFAULTS = {
    priorP: 0.5,          // 先验概率 P(S)
    dprime: 1.5,          // 设计 d′（难度）
    trials: 40,           // 每局试次数
    observeMs: 2500,      // 单次观察时长（刺激限时）
    feedback: false,      // 是否逐次反馈（正式实验建议关闭）
    seed: null            // 随机种子；null 表示每局随机
  };

  /** 参数下限／上限，供滑块使用 */
  const LIMITS = {
    priorP: { min: 0.1, max: 0.9, step: 0.05 },
    dprime: { min: 0.2, max: 4.0, step: 0.1 },
    trials: { min: 20, max: 80, step: 10 },
    observeMs: { min: 1000, max: 6000, step: 500 }
  };

  /** 参数预设：一键切到某种"任务情境" */
  const PRESETS = [
    {
      id: 'standard',
      name: '标准任务',
      desc: '目标出现与不出现各占一半，中等难度',
      params: { priorP: 0.5, dprime: 1.5, trials: 40, observeMs: 2500 }
    },
    {
      id: 'rare',
      name: '低先验 · 目标罕见',
      desc: 'P(S)=0.2：十次里大约只有两次有目标',
      params: { priorP: 0.2, dprime: 1.5, trials: 40, observeMs: 2500 }
    },
    {
      id: 'frequent',
      name: '高先验 · 目标频繁',
      desc: 'P(S)=0.8：大多数记录里都有目标',
      params: { priorP: 0.8, dprime: 1.5, trials: 40, observeMs: 2500 }
    },
    {
      id: 'goodgear',
      name: '装备升级 · 高灵敏度',
      desc: 'd′=3.0：线谱清晰可辨，考验的是标准而非能力',
      params: { priorP: 0.5, dprime: 3.0, trials: 30, observeMs: 2000 }
    },
    {
      id: 'roughsea',
      name: '恶劣海况 · 高噪声',
      desc: 'd′=0.8：4 级海况，线谱几乎看不见',
      params: { priorP: 0.5, dprime: 0.8, trials: 40, observeMs: 3000 }
    }
  ];

  /** 判定标准的文字解读（按 c 的取值分段） */
  const CRITERION_LABELS = [
    { max: -0.6, label: '非常宽松', desc: '宁可错报，绝不放过——倾向回答「有目标」' },
    { max: -0.2, label: '偏宽松', desc: '略微偏向回答「有目标」' },
    { max: 0.2, label: '中性', desc: '判定标准接近无偏（β ≈ 1）' },
    { max: 0.6, label: '偏保守', desc: '略微偏向回答「无目标」' },
    { max: Infinity, label: '非常保守', desc: '没有十足把握就不报——倾向回答「无目标」' }
  ];

  SDT.config = {
    SCENARIO,
    PRIOR_LEVELS,
    DIFFICULTY_LEVELS,
    TRIAL_LEVELS,
    OBSERVE_LEVELS,
    DEFAULTS,
    LIMITS,
    PRESETS,
    CRITERION_LABELS,

    /** 依据 c 值给出文字解读 */
    criterionLabel(c) {
      for (const item of CRITERION_LABELS) {
        if (c <= item.max) return item;
      }
      return CRITERION_LABELS[CRITERION_LABELS.length - 1];
    }
  };
})(window);
