/**
 * utils.js —— 通用工具库
 * ---------------------------------------------------------------------------
 * 内容：
 *   · 可复现的伪随机数生成器（mulberry32）与常用分布采样
 *   · 正态分布 pdf / cdf / 分位数（SDT 全部计算的数学基础）
 *   · 数值格式化与零依赖的 DOM 小工具
 * 无任何外部依赖，所有函数挂在 window.SDT.util 下。
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SDT = global.SDT || (global.SDT = {});

  /* =======================================================================
   * 1. 随机数：mulberry32 —— 32 位快速伪随机数，给定种子可完整复现一局实验
   * ===================================================================== */
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const rng = function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.seed = seed;
    return rng;
  }

  /** 标准正态随机数（Box–Muller 变换） */
  function randNormal(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** 指数分布随机数（均值 = mean）—— 声呐噪声功率的常用模型 */
  function randExp(rng, mean) {
    const u = 1 - rng();
    return -Math.log(u) * (mean === undefined ? 1 : mean);
  }

  /** 从 [min, max] 均匀取整 */
  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  /** Fisher–Yates 原地洗牌 */
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* =======================================================================
   * 2. 正态分布函数
   * ===================================================================== */

  /** 标准正态概率密度 φ(z) */
  function normPdf(z) {
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  }

  /**
   * 标准正态累积分布 Φ(z)
   * 采用 Zelen & Severo (1964) 的有理逼近，绝对误差 < 7.5e-8，足够 SDT 使用。
   */
  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
      t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - p : p;
  }

  /**
   * 标准正态分位数 z = Φ⁻¹(p)
   * 采用 Acklam (2000) 的混合有理逼近（相对误差 < 1.15e-9）。
   * 这是 SDT 里把「概率」换算成「z 分数」的关键函数。
   */
  function normInv(p) {
    if (p <= 0) p = 1e-12;
    if (p >= 1) p = 1 - 1e-12;

    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];

    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
      // 左尾
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= pHigh) {
      // 中段
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    // 右尾
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  /* =======================================================================
   * 3. 数值与文本工具
   * ===================================================================== */

  function clamp(x, min, max) {
    return x < min ? min : (x > max ? max : x);
  }

  /** 固定小数位；非有限值显示为占位符 */
  function fixed(x, digits, placeholder) {
    if (!isFinite(x)) return placeholder === undefined ? '—' : placeholder;
    return Number(x).toFixed(digits === undefined ? 2 : digits);
  }

  /** 百分比文本 */
  function pct(x, digits) {
    if (!isFinite(x)) return '—';
    return (x * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }

  /** 把 **文字** 转成 <strong>文字</strong>（配置文案里用到轻量标记） */
  function bold(text) {
    return String(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  /** 转义 HTML，用于把用户可控内容安全地放进 DOM */
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** 下载一个文本文件（用于导出 CSV），纯前端实现 */
  function downloadText(filename, text, mime) {
    const blob = new Blob(['\ufeff' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** 极简 DOM 选择器 */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** 创建元素：el('div', {class:'x'}, ['文本']) */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.indexOf('data-') === 0) node.setAttribute(k, attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /** 时间戳 → 便于阅读的短字符串 */
  function stamp(date) {
    const d = date || new Date();
    const p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  SDT.util = {
    makeRng, randNormal, randExp, randInt, shuffle,
    normPdf, normCdf, normInv,
    clamp, fixed, pct, bold, escapeHtml, downloadText,
    $, $$, el, stamp
  };
})(window);
