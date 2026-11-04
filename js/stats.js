/* ============================================================
 * stats.js —— 结果页用的统计函数（无外部依赖）
 *
 * 提供：描述统计、配对/单样本/独立样本 t 检验、Cohen's d(z/av)、
 *       Cohen's h、95% CI、正态分位数（算 d' 与 c 用）
 *
 * 实现说明：t 分布用不完全 Beta 函数（Numerical Recipes 连分数法）求
 * CDF，再二分法反解临界值；p 值双尾。被试数少时这点精度完全够用，
 * 但正式论文请用 R/JASP 复核。
 * ============================================================ */

(function (global) {
  'use strict';

  /* ---------------- 描述统计 ---------------- */

  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }
  function variance(a) {
    if (a.length < 2) return NaN;
    var m = mean(a);
    return a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1);
  }
  function sd(a) { return Math.sqrt(variance(a)); }
  function sem(a) { return sd(a) / Math.sqrt(a.length); }
  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; });
    var n = b.length;
    if (!n) return NaN;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }

  /* ---------------- 特殊函数 ---------------- */

  function gammaln(x) {
    var cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function betacf(a, b, x) {
    var MAXIT = 200, EPS = 3e-12, FPMIN = 1e-30;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /** 正则化不完全 Beta 函数 I_x(a,b) */
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /** t 分布 CDF */
  function tcdf(t, df) {
    var xt = df / (df + t * t);
    var p = 0.5 * betai(df / 2, 0.5, xt);
    return t > 0 ? 1 - p : p;
  }

  /** 双尾 p 值 */
  function tp(t, df) {
    if (!isFinite(t) || !isFinite(df)) return NaN;
    return Math.min(1, 2 * (1 - tcdf(Math.abs(t), df)));
  }

  /** t 分位数（二分法反解 CDF） */
  function tinv(p, df) {
    var lo = -1e3, hi = 1e3;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (tcdf(mid, df) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** 标准正态分位数（Acklam 近似，精度 ~1e-9），用于 d' / c */
  function normInv(p) {
    if (p <= 0) p = 1e-6;
    if (p >= 1) p = 1 - 1e-6;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - pl) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
              ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /* ---------------- 检验 ---------------- */

  /** 单样本 t（对 0 或给定 mu） */
  function oneSampleT(x, mu) {
    mu = mu || 0;
    var n = x.length;
    if (n < 2) return null;
    var d = x.map(function (v) { return v - mu; });
    var m = mean(x), s = sd(x);
    if (!s) return null;
    var se = s / Math.sqrt(n);
    var t = (m - mu) / se, df = n - 1;
    var crit = tinv(0.975, df);
    return {
      n: n, mean: m, sd: s, se: se, t: t, df: df, p: tp(t, df),
      dz: (m - mu) / s,
      ci: [m - crit * se, m + crit * se]
    };
  }

  /** 配对 t：ys - xs（正数表示 ys 更大） */
  function pairedT(xs, ys) {
    var n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    var diff = [];
    for (var i = 0; i < n; i++) diff.push(ys[i] - xs[i]);
    var r = oneSampleT(diff, 0);
    if (!r) return null;
    r.meanDiff = r.mean;
    r.sdDiff = r.sd;
    return r;
  }

  /** 独立样本 t（Welch 校正） */
  function indT(a, b) {
    var na = a.length, nb = b.length;
    if (na < 2 || nb < 2) return null;
    var ma = mean(a), mb = mean(b), va = variance(a), vb = variance(b);
    var se = Math.sqrt(va / na + vb / nb);
    if (!se) return null;
    var t = (ma - mb) / se;
    var df = Math.pow(va / na + vb / nb, 2) /
             (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
    var pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
    var crit = tinv(0.975, df);
    return {
      n1: na, n2: nb, mean1: ma, mean2: mb, sd1: Math.sqrt(va), sd2: Math.sqrt(vb),
      t: t, df: df, p: tp(t, df), dav: pooled ? (ma - mb) / pooled : NaN,
      ci: [(ma - mb) - crit * se, (ma - mb) + crit * se]
    };
  }

  /** Cohen's h（两个比例之差） */
  function cohenH(p1, p2) {
    var f = function (p) {
      p = Math.min(1 - 1e-6, Math.max(1e-6, p));
      return 2 * Math.asin(Math.sqrt(p));
    };
    return f(p1) - f(p2);
  }

  /** 效应量语义标签（Cohen 1988 惯例） */
  function dLabel(d) {
    var a = Math.abs(d);
    if (!isFinite(a)) return '—';
    if (a < 0.2) return '可忽略';
    if (a < 0.5) return '小';
    if (a < 0.8) return '中';
    return '大';
  }

  /** p 值格式化：小于 .001 用 "< .001" */
  function fmtP(p) {
    if (p === null || p === undefined || isNaN(p)) return '—';
    if (p < 0.001) return '< .001';
    return '= ' + p.toFixed(3).replace(/^0/, '');
  }

  global.Stats = {
    sum: sum, mean: mean, variance: variance, sd: sd, sem: sem, median: median,
    tcdf: tcdf, tp: tp, tinv: tinv, normInv: normInv, betai: betai,
    oneSampleT: oneSampleT, pairedT: pairedT, indT: indT,
    cohenH: cohenH, dLabel: dLabel, fmtP: fmtP
  };
})(window);
