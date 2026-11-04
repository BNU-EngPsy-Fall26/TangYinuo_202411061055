/* ============================================================
 * core.js —— 通用实验引擎
 *
 * 职责：
 *   1. 匿名被试编号（本机持久化，绝不含姓名/学号）
 *   2. 知情同意状态
 *   3. 试次循环、进度条、注视点、反馈、按键/按钮反应采集
 *   4. 计时：统一 performance.now()（单调时钟，不受系统时间影响）
 *   5. 数据落库：本机 localStorage 备份 → 上传收数接口 → CSV 兜底
 *
 * 对外暴露 window.ALAB
 * ============================================================ */

(function (global) {
  'use strict';

  var CFG = global.ALAB_CONFIG || {};
  var REGISTRY = {};      // id -> 实验模块
  var ORDER = [];         // 注册顺序

  /* ------------------------------------------------------------
   * 一、小工具
   * ---------------------------------------------------------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  /** 轻量建 DOM：el('div', {class:'x', text:'hi', onclick:fn}, [子节点]) */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else node.setAttribute(k, v);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  function fmt(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(d === undefined ? 2 : d);
  }

  /* ------------------------------------------------------------
   * 二、本机存储
   * ---------------------------------------------------------- */

  var K_PID = 'alab.pid.v1';
  var K_CONSENT = 'alab.consent.v1';
  var K_LOG = 'alab.log.v1';

  // 极少数环境（file:// 且浏览器禁用存储、无痕模式）里 localStorage 会抛错，
  // 这里退化为内存存储，保证实验流程不中断——代价是关页面就丢，所以仍会提示导出 CSV。
  var memoryStore = {};
  var canUseLS = (function () {
    try {
      var k = '__alab_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  var store = {
    get: function (k, dflt) {
      if (!canUseLS) return k in memoryStore ? memoryStore[k] : dflt;
      try {
        var v = localStorage.getItem(k);
        return v === null ? dflt : JSON.parse(v);
      } catch (e) { return k in memoryStore ? memoryStore[k] : dflt; }
    },
    set: function (k, v) {
      memoryStore[k] = v;
      if (!canUseLS) return;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 配额/隐私模式 */ }
    },
    del: function (k) {
      delete memoryStore[k];
      if (!canUseLS) return;
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    },
    persistent: canUseLS
  };

  /**
   * 匿名被试编号：首次进入自动生成，之后在同一浏览器复用。
   * 形如 P-4K7Q2M。不采集任何可识别信息。
   */
  function participantId() {
    var pid = store.get(K_PID, null);
    if (!pid) {
      pid = 'P-' + Date.now().toString(36).slice(-3).toUpperCase() +
            Math.random().toString(36).slice(2, 5).toUpperCase();
      store.set(K_PID, pid);
    }
    return pid;
  }

  function hasConsent() { return !!store.get(K_CONSENT, false); }
  function giveConsent() {
    store.set(K_CONSENT, true);
    store.set(K_CONSENT + '.at', new Date().toISOString());
  }

  /* ------------------------------------------------------------
   * 三、数据：本地备份、上传、CSV
   * ---------------------------------------------------------- */

  function logSubmission(payload) {
    if (CFG.keepLocalBackup === false) return;
    var log = store.get(K_LOG, []);
    log.push(payload);
    // 只保留最近 40 条，避免占满 localStorage
    if (log.length > 40) log = log.slice(log.length - 40);
    store.set(K_LOG, log);
  }

  function localSubmissions() { return store.get(K_LOG, []); }

  /** 被试端上传：失败重试一次，仍失败则回落到 CSV */
  function postOnce(body) {
    return fetch(CFG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json().catch(function () { return {}; });
    });
  }

  function submit(body) {
    // 用 attempt 包一层：某些环境（老浏览器、file:// 某些内核）里 fetch 缺失
    // 或同步抛错，不能让异常冒到结束页——数据已在本机，仍可走 CSV 兜底。
    function attempt() {
      try {
        return postOnce(body);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return attempt().catch(function () {
      return sleep(700).then(attempt);
    });
  }

  /** 把记录摊平成 CSV（一行一个试次） */
  function toCSV(rows) {
    if (!rows.length) return '';
    var keys = [];
    rows.forEach(function (r) {
      Object.keys(r).forEach(function (k) {
        if (keys.indexOf(k) === -1) keys.push(k);
      });
    });
    var esc = function (v) {
      if (v === null || v === undefined) return '';
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var out = [keys.join(',')];
    rows.forEach(function (r) {
      out.push(keys.map(function (k) { return esc(r[k]); }).join(','));
    });
    return out.join('\n');
  }

  function download(filename, text, mime) {
    var blob = new Blob(['\ufeff' + text], { type: mime || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ------------------------------------------------------------
   * 四、实验注册表
   * ---------------------------------------------------------- */

  function register(exp) {
    if (!exp || !exp.id) throw new Error('实验模块必须有 id');
    REGISTRY[exp.id] = exp;
    ORDER.push(exp.id);
  }

  /* 配置自检：只在控制台提醒研究者，不影响被试界面 */
  if (!CFG.projectCode || !CFG.uploadEnabled) {
    if (global.console && console.warn) {
      console.warn('[注意实验室] 收数接口尚未启用：请先在 js/config.js 填写 projectCode 并把 uploadEnabled 设为 true。' +
                   '当前状态下被试数据不会自动上传，需要被试手动下载 CSV。');
    }
  }

  function get(id) { return REGISTRY[id]; }
  function list() {
    return ORDER.map(function (id) { return REGISTRY[id]; });
  }

  /* ------------------------------------------------------------
   * 五、运行一个实验
   * ---------------------------------------------------------- */

  function beginRun(expId, view) {
    var exp = get(expId);
    if (!exp) { location.hash = '#/'; return; }

    var pid = participantId();
    var startedAt = new Date().toISOString();

    /* ---- 运行容器 ---- */
    view.innerHTML = '';
    var barFill = el('i');
    var wrapEl = el('div', { class: 'stage-wrap' });
    var respEl = el('div', { class: 'resp' });
    var stageEl = el('div', { class: 'stage' }, [wrapEl, respEl]);
    var hintEl = el('p', { class: 'hint' });

    var head = el('div', { class: 'run-head' }, [
      el('div', { class: 'run-title', text: exp.title }),
      el('button', {
        class: 'linkbtn',
        text: '中断实验',
        onclick: function () {
          if (global.confirm('确定中断？本次已完成的数据不会上传。')) location.hash = '#/';
        }
      })
    ]);

    view.appendChild(head);
    view.appendChild(el('div', { class: 'bar' }, [barFill]));
    view.appendChild(stageEl);
    view.appendChild(hintEl);

    /* ---- 上下文 ctx：实验模块唯一的对外接口 ---- */
    var ctx = {
      exp: exp,
      pid: pid,
      startedAt: startedAt,
      stageEl: stageEl,
      wrapEl: wrapEl,
      respEl: respEl,

      /** 替换舞台内容 */
      setStage: function (nodes) {
        wrapEl.innerHTML = '';
        (Array.isArray(nodes) ? nodes : [nodes]).forEach(function (n) {
          if (n) wrapEl.appendChild(n);
        });
      },

      /** 顶部提示行 */
      hint: function (html) {
        hintEl.innerHTML = html || '';
      },

      progress: function (i, total) {
        var pct = total ? Math.round((i / total) * 100) : 0;
        barFill.style.width = pct + '%';
      },

      sleep: sleep,

      /** 注视点：'+' 居中 ms 毫秒 */
      fixation: function (ms) {
        respEl.innerHTML = '';
        wrapEl.innerHTML = '';
        wrapEl.appendChild(el('div', {
          html: '<div style="font-size:44px;line-height:1;color:#3c4a5a;'
              + 'font-family:ui-monospace,Consolas,monospace">+</div>'
        }));
        return sleep(ms);
      },

      /**
       * 等待反应：键盘 + 屏幕按钮双通道（手机被试可用）
       * @param {string[]} keys    接受的键（小写），第一个为主键
       * @param {string[]} labels  与 keys 对应的按钮文字
       * @param {number} timeoutMs 超时毫秒；0 表示不限
       * @param {number} t0        计时起点（performance.now()），默认此刻
       * @returns Promise<{key, rt, timeout}>
       */
      waitResponse: function (keys, labels, timeoutMs, t0) {
        return new Promise(function (resolve) {
          var start = t0 === undefined ? performance.now() : t0;
          var done = false;
          var timer = null;
          var buttons = [];

          function cleanup() {
            document.removeEventListener('keydown', onKey);
            if (timer) clearTimeout(timer);
            buttons.forEach(function (b) { b.removeEventListener('click', b._h); });
            respEl.innerHTML = '';
          }

          function finish(key, isTimeout) {
            if (done) return;
            done = true;
            var rt = performance.now() - start;
            cleanup();
            resolve({ key: key, rt: rt, timeout: !!isTimeout });
          }

          function onKey(e) {
            var k = (e.key || '').toLowerCase();
            if (keys.indexOf(k) === -1) return;
            e.preventDefault();
            finish(k, false);
          }

          respEl.innerHTML = '';
          keys.forEach(function (k, i) {
            var b = el('button', {
              class: 'btn' + (i === 0 ? ' primary' : ''),
              html: (labels && labels[i] ? labels[i] : k.toUpperCase()) +
                    '<span class="k">键 ' + k.toUpperCase() + '</span>'
            });
            b._h = function () { finish(k, false); };
            b.addEventListener('click', b._h);
            buttons.push(b);
            respEl.appendChild(b);
          });

          document.addEventListener('keydown', onKey);
          if (timeoutMs) timer = setTimeout(function () { finish(null, true); }, timeoutMs);
        });
      },

      /** 反馈（练习阶段用），ms 毫秒后自动消失 */
      feedback: function (text, ok, ms) {
        var node = el('div', { class: 'fb ' + (ok ? 'ok' : 'bad'), text: text });
        wrapEl.appendChild(node);
        return sleep(ms || 700).then(function () { node.remove(); });
      },

      /** 暂停页（阶段间休息 / 进入正式实验），点按钮继续。
       *  注意：不销毁模块已挂载的节点（canvas 等），继续时原样还原。 */
      pause: function (html, btnText) {
        return new Promise(function (resolve) {
          var saved = Array.prototype.slice.call(wrapEl.childNodes);
          respEl.innerHTML = '';
          wrapEl.innerHTML = '';
          wrapEl.appendChild(el('div', { class: 'center-text', html: html }));
          var b = el('button', {
            class: 'btn primary',
            text: btnText || '继续',
            onclick: function () {
              wrapEl.innerHTML = '';
              saved.forEach(function (n) { wrapEl.appendChild(n); });
              resolve();
            }
          });
          wrapEl.appendChild(el('div', { class: 'btn-row', style: 'justify-content:center' }, [b]));
        });
      },

      /**
       * 跑一串试次。
       * handler(trial, index, ctx) 必须返回一个对象，且**自带 cond 字段**
       * （引擎不做试次合并，避免把刺激数组写进数据）。
       */
      runTrials: function (trials, handler) {
        var out = [];
        var i = 0;
        function step() {
          if (i >= trials.length) return Promise.resolve(out);
          var idx = i++;
          ctx.progress(idx, trials.length);
          return Promise.resolve(handler(trials[idx], idx, ctx))
            .then(function (r) {
              if (r) out.push(r);
              return sleep(120).then(step);
            });
        }
        return step();
      },

      /** 收尾：本地备份 → 上传 → 结束页 */
      finish: function (results) {
        var payload = {
          project: CFG.projectCode || 'UNSET',
          experiment: exp.id,
          participant: pid,
          condition: exp.conditionOf ? exp.conditionOf(results) : 'within',
          trials: results.map(function (r) {
            var t = {};
            Object.keys(r).forEach(function (k) {
              if (k.charAt(0) === '_') return;
              t[k] = r[k];
            });
            return t;
          })
        };

        payload.submittedAt = new Date().toISOString();
        payload.expTitle = exp.title;
        payload.durationSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
        logSubmission(payload);

        var uploadTask;
        if (CFG.uploadEnabled && CFG.projectCode) {
          uploadTask = submit(payload).then(function () { return 'ok'; })
            .catch(function () { return 'fail'; });
        } else {
          uploadTask = Promise.resolve('off');
        }

        return uploadTask.then(function (status) {
          renderEnd(ctx, payload, status);
        });
      }
    };

    /* ---- 结束页 ---- */
    function renderEnd(c, payload, status) {
      barFill.style.width = '100%';
      respEl.innerHTML = '';
      wrapEl.innerHTML = '';

      var statusMap = {
        ok: { cls: 'ok', text: '已上传到注意实验室收数接口' },
        off: { cls: 'bad', text: '未连接收数接口 —— 请点下面按钮下载 CSV 发给主试' },
        fail: { cls: 'bad', text: '上传失败（网络问题），请点下面按钮下载 CSV 发给主试' }
      };
      var s = statusMap[status] || statusMap.off;

      wrapEl.appendChild(el('div', { class: 'big-msg', text: '实验结束，谢谢你！' }));
      wrapEl.appendChild(el('p', {
        class: 'center-text dim',
        html: '你的匿名编号是 <b style="color:#16202c;font-size:17px;letter-spacing:.5px">' +
              c.pid + '</b><br>请把这个编号告诉主试（截图或复制均可）。'
      }));
      wrapEl.appendChild(el('p', {
        class: 'center-text',
        html: '<span class="chip ' + s.cls + '">' + s.text + '</span>'
      }));

      var btns = [
        el('button', {
          class: 'btn primary',
          text: '下载我的数据（CSV）',
          onclick: function () {
            download('alab_' + c.exp.id + '_' + c.pid + '.csv', toCSV(payload.trials));
          }
        }),
        el('button', {
          class: 'btn',
          text: '再做一个实验',
          onclick: function () { location.hash = '#/'; }
        })
      ];
      wrapEl.appendChild(el('div', { class: 'btn-row', style: 'justify-content:center' }, btns));
      wrapEl.appendChild(el('p', {
        class: 'center-text small dim',
        style: 'margin-top:18px',
        text: '共 ' + payload.trials.length + ' 个试次，用时约 ' +
              Math.max(1, Math.round(payload.durationSec / 60)) + ' 分钟。'
      }));
      c.hint('');
    }

    /* ---- 防止误关页面丢数据 ---- */
    function guard(e) {
      e.preventDefault();
      e.returnValue = '实验进行中，离开会丢失数据。';
      return e.returnValue;
    }
    global.addEventListener('beforeunload', guard);
    var clearGuard = function () { global.removeEventListener('beforeunload', guard); };
    global.addEventListener('hashchange', clearGuard, { once: true });

    /* ---- 交给实验模块 ---- */
    exp.start(ctx).catch(function (err) {
      clearGuard();
      console.error(err);
      wrapEl.innerHTML = '';
      wrapEl.appendChild(el('div', {
        class: 'big-msg',
        text: '实验出错了：' + (err && err.message ? err.message : err)
      }));
      wrapEl.appendChild(el('p', { class: 'center-text dim', text: '请刷新页面重试，或联系主试。' }));
    });
  }

  /* ------------------------------------------------------------
   * 六、导出
   * ---------------------------------------------------------- */

  global.ALAB = {
    CFG: CFG,
    register: register,
    get: get,
    list: list,
    beginRun: beginRun,
    $: $,
    el: el,
    rand: rand,
    randInt: randInt,
    choice: choice,
    shuffle: shuffle,
    sleep: sleep,
    fmt: fmt,
    store: store,
    participantId: participantId,
    hasConsent: hasConsent,
    giveConsent: giveConsent,
    localSubmissions: localSubmissions,
    toCSV: toCSV,
    download: download
  };
})(window);
