/* ============================================================
 * app.js —— 路由与页面
 *
 * 路由（hash）：
 *   #/            实验列表
 *   #/run/<id>    进入某个实验（未同意则先出知情同意）
 *   #/results     结果页
 *   #/about       项目说明
 *   #/researcher  研究者备份面板（导出本机缓存）
 * ============================================================ */

(function (global) {
  'use strict';

  var A = global.ALAB;
  var el = A.el;

  /* ============================================================
   * 首页
   * ========================================================== */

  function renderHome(view) {
    var expList = A.list();

    var html = '<h1>注意实验室</h1><div class="rule"></div>' +
      '<p class="lede">三个经典注意范式的在线复现，每个都带一个可以检验的改进条件。</p>' +
      '<p class="dim">选一个实验完成即可，约 5–7 分钟。全程匿名，数据只用于课程分析。' +
      '建议在安静环境、用电脑或手机单独完成，不要中途切屏。</p>';

    view.innerHTML = html;

    var cards = el('div', { class: 'cards' });
    expList.forEach(function (exp) {
      var card = el('div', { class: 'card' }, [
        el('span', { class: 'card-tag', text: exp.week + ' · 经典范式' }),
        el('h3', { text: exp.title }),
        el('p', { class: 'ref', text: exp.ref }),
        el('ul', {}, [
          el('li', { html: '<b>设计：</b>' + exp.design }),
          el('li', { html: '<b>改进：</b>' + exp.improvement })
        ]),
        el('div', { class: 'spacer' }),
        el('div', { class: 'meta-row' }, [
          el('span', { text: exp.minutes }),
          el('span', { text: exp.trialsText })
        ]),
        el('div', { class: 'btn-row' }, [
          el('button', {
            class: 'btn primary',
            text: '开始实验',
            onclick: function () { location.hash = '#/run/' + exp.id; }
          })
        ])
      ]);
      cards.appendChild(card);
    });
    view.appendChild(cards);

    view.appendChild(el('div', { class: 'panel', style: 'margin-top:28px' }, [
      el('h3', { text: '开始前请确认' }),
      el('ul', {
        html: '<li>你已年满 18 岁，自愿参加，可随时关闭页面退出（数据不会上传）。</li>' +
              '<li>请<b>单独</b>完成，不要与他人讨论，不要反复重做同一实验——那会污染数据。</li>' +
              '<li>手机也可以完成：反应按钮在屏幕下方，键盘 F/J 同样可用。</li>' +
              '<li>同一浏览器会记住你的匿名编号；换设备会生成新编号，属正常现象。</li>'
      })
    ]));

    view.appendChild(hostBar(expList));
  }

  /**
   * 主试栏：只在同一台电脑连续测多人时需要。
   * 显示当前编号 + 这位被试已经做完哪几个实验，并提供「换下一位被试」。
   */
  function hostBar(expList) {
    var pid = A.participantId();
    var mine = A.localSubmissions().filter(function (s) { return s.participant === pid; });
    var done = {};
    mine.forEach(function (s) { done[s.experiment] = true; });

    var progress = expList.map(function (exp) {
      return exp.title.replace(/（.*?）/g, '') + (done[exp.id] ? ' ✓' : ' —');
    }).join('　');

    var btn = el('button', {
      class: 'btn',
      text: '换下一位被试（重置编号）',
      onclick: function () {
        if (!global.confirm('换人前请确认：当前这位被试的实验都已完成。\n\n重置后编号会变更，刚才那位的记录仍保留在本机与后台。继续？')) return;
        var np = A.newParticipant();
        global.alert('已生成新的匿名编号：' + np + '\n可以开始下一位被试了（会重新显示知情同意）。');
        route();
      }
    });

    return el('div', { class: 'panel host-bar' }, [
      el('h3', { text: '主试栏（被试无需操作）' }),
      el('p', {
        class: 'small',
        html: '当前编号：<b class="pid-chip">' + pid + '</b>　本机已完成：' + progress
      }),
      el('div', { class: 'btn-row' }, [btn]),
      el('p', {
        class: 'small dim',
        text: '同一位被试连做多个实验时不要点它；换人时点一次，编号会变，后台才算作新被试。'
      })
    ]);
  }

  /* ============================================================
   * 知情同意
   * ========================================================== */

  function renderConsent(view, exp) {
    view.innerHTML = '';
    var pid = A.participantId();

    var box = el('div', { class: 'consent-box' }, [
      el('p', { html: '<b>研究名称：</b>注意过程的经典范式复现与改进（课程作业）' }),
      el('p', { html: '<b>研究目的：</b>在课堂范围内检验三个经典注意实验的现象是否可复现，并测试本研究的改进条件。' }),
      el('p', { html: '<b>你要做什么：</b>完成「' + exp.title + '」，' + exp.trialsText + '，' + exp.minutes + '。' +
        '过程中需要注视屏幕并按 F / J（或点击按钮）作答。' }),
      el('p', { html: '<b>风险：</b>本任务无已知风险，强度不超过日常看屏幕；如感到疲劳可随时关闭页面退出。' }),
      el('p', { html: '<b>自愿与退出：</b>参加完全自愿。你可以在任何阶段关闭页面退出，已产生的数据不会上传。' }),
      el('p', { html: '<b>匿名与保密：</b>不收集姓名、学号、手机号、IP 等信息，只记录匿名编号（本机自动生成，如 P-4K7Q2M）、' +
        '按键反应、反应时和试次条件。数据仅用于本课程的成绩评定与课堂讨论，不作他用。' }),
      el('p', { html: '<b>数据去向：</b>实验结束后自动上传到课程指定的收数接口，由任课教师与助教查看；' +
        '你也可以随时下载自己的原始数据。' }),
      el('p', { html: '<b>联系：</b>如有疑问，请联系课程助教（联系方式见课程群公告）。' })
    ]);

    var check = el('input', { type: 'checkbox', id: 'agree' });
    var startBtn = el('button', {
      class: 'btn primary',
      text: '我已阅读并同意，开始实验',
      disabled: 'disabled',
      onclick: function () {
        if (!check.checked) return;
        A.giveConsent();
        A.beginRun(exp.id, view);
      }
    });

    check.addEventListener('change', function () {
      if (check.checked) startBtn.removeAttribute('disabled');
      else startBtn.setAttribute('disabled', 'disabled');
    });

    view.appendChild(el('div', { class: 'panel' }, [
      el('h1', { text: '知情同意书' }),
      el('p', { class: 'dim', text: '你的匿名编号：' + pid + '（请勿填写真实姓名或学号）' }),
      box,
      el('label', { class: 'checkline', for: 'agree' }, [
        check,
        el('span', { text: '我已阅读以上说明，理解研究目的与程序，自愿参加本次实验。' })
      ]),
      el('div', { class: 'btn-row' }, [startBtn])
    ]));
  }

  /* ============================================================
   * 说明页
   * ========================================================== */

  function renderAbout(view) {
    var rows = A.list().map(function (exp) {
      return [exp.week, exp.title, exp.ref.split('.')[0], exp.improvement];
    });

    view.innerHTML = '<h1>项目说明</h1><div class="rule"></div>' +
      '<div class="panel">' +
      '<h3>这是什么</h3>' +
      '<p>「注意实验室」是工程心理学课程作业二的提交物：把 W5–W8 的经典注意范式做成可以在浏览器里直接跑的实验，' +
      '每个实验都加了一个自己的改进条件，并且至少有一个改进作为<b>新条件真正收了数据</b>来检验。</p>' +

      '<h3>三个实验</h3>' +
      '<ul>' +
      '<li><b>闪烁变化盲</b>（W5）：复现 Rensink 等（1997）的闪烁范式；改进是把"注意集"做成操纵——只监测蓝色方块，' +
      '变化随机落在目标色或非目标色物体上。</li>' +
      '<li><b>低流行率视觉搜索</b>（W6）：复现 Wolfe 等（2005）的低流行率效应；改进是低流行率条件下加入每试次即时反馈，' +
      '检验漏报来自"标准漂移"还是"看不见"。</li>' +
      '<li><b>比例判断</b>（W7）：复现 Cleveland &amp; McGill（1984）的图形知觉差异；改进是给图形加 .25/.50/.75 刻度线，' +
      '检验锚点能否降低判断误差。</li>' +
      '</ul>' +

      '<h3>数据字段</h3>' +
      '<p class="small">上传到收数接口的每条记录包含：<code>project</code>（6 位项目码）、<code>experiment</code>、' +
      '<code>participant</code>（匿名编号）、<code>condition</code>、<code>trials</code>（试次数组）。' +
      '每个试次记录条件标签、反应时（ms）、正误，以及该实验特有的字段（如搜索实验的目标有无、比例判断的真实比例与估计值）。' +
      '所有时间戳均来自 <code>performance.now()</code> 单调时钟。</p>' +

      '<h3>技术栈</h3>' +
      '<p class="small">纯前端：HTML + CSS + 原生 JavaScript，无框架、无构建步骤。' +
      '数据画在 <code>&lt;canvas&gt;</code> 上以保证毫秒级呈现控制；统计在结果页现场计算（配对 t 检验、Cohen\'s dz、95% CI）。' +
      '双击 <code>index.html</code> 即可离线运行。</p>' +

      '<h3>隐私</h3>' +
      '<p class="small">不收集任何可识别个人信息。匿名编号在浏览器本地生成并保存，换设备会生成新编号。' +
      '页面不接入任何第三方统计或广告脚本。</p>' +

      '<h3>AI 使用说明</h3>' +
      '<p class="small">本项目的程序设计、刺激绘制与统计代码在 AI 助手（WorkBuddy）辅助下完成；' +
      '实验选题、改进思路、假设预测、结果解释与讨论由作者本人确定并对内容负责。' +
      '详见仓库 README 的「AI 使用说明」一节。</p>' +
      '</div>';

    view.appendChild(el('p', {
      class: 'dim small',
      style: 'margin-top:16px',
      html: '实验清单：' + A.list().map(function (e) { return e.week + ' ' + e.title; }).join(' · ')
    }));
  }

  /* ============================================================
   * 研究者面板（本机缓存兜底）
   * ========================================================== */

  function renderResearcher(view) {
    var log = A.localSubmissions();
    var cfg = A.CFG;

    var rows = log.map(function (s) {
      return [
        s.participant,
        s.experiment,
        s.trials ? s.trials.length : 0,
        s.submittedAt ? s.submittedAt.replace('T', ' ').slice(0, 19) : '—'
      ];
    });

    view.innerHTML = '<h1>研究者备份</h1><div class="rule"></div>' +
      '<p class="lede">被试浏览器在每次实验结束时会留一份本机备份（即使上传失败也不丢）。' +
      '这里只显示<b>当前这台设备</b>完成的记录，用于被试把 CSV 发给你时核对。</p>' +
      '<div class="panel">' +
      '<h3>收数配置状态</h3>' +
      '<p class="small">项目码：<code>' + (cfg.projectCode || '（未填写）') + '</code>　' +
      '自动上传：<b>' + (cfg.uploadEnabled ? '已开启' : '未开启') + '</b>　' +
      '接口：<code>' + cfg.apiEndpoint + '</code></p>' +
      (cfg.projectCode && cfg.uploadEnabled
        ? '<p class="small" style="color:#1f7a4d">配置正常，被试完成后会自动上传。</p>'
        : '<p class="small" style="color:#a83232">注意：项目码为空或自动上传未开启，数据只会留在被试本机，需要让他们下载 CSV 发给你。</p>') +
      '</div>' +
      (log.length
        ? '<h3 style="margin-top:26px">本机记录（' + log.length + ' 条）</h3>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>匿名编号</th><th>实验</th><th>试次数</th><th>提交时间</th>' +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td>' + r[0] + '</td><td class="num">' + r[1] +
                   '</td><td class="num">' + r[2] + '</td><td class="num">' + r[3] + '</td></tr>';
          }).join('') +
          '</tbody></table></div>'
        : '<div class="empty">这台设备上还没有完成过实验。</div>');

    view.appendChild(el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn primary',
        text: '导出全部本机记录（CSV）',
        onclick: function () {
          var rowsOut = [];
          log.forEach(function (s) {
            s.trials.forEach(function (t, i) {
              rowsOut.push(Object.assign({
                participant: s.participant,
                experiment: s.experiment,
                condition: s.condition,
                trial_index: i + 1,
                submitted_at: s.submittedAt
              }, t));
            });
          });
          if (!rowsOut.length) { alert('没有可导出的数据。'); return; }
          A.download('alab_local_backup.csv', A.toCSV(rowsOut));
        }
      }),
      el('button', {
        class: 'btn',
        text: '清空本机记录',
        onclick: function () {
          if (!global.confirm('清空这台设备上的备份记录？此操作不可撤销。')) return;
          A.store.del('alab.log.v1');
          route();
        }
      })
    ]));
  }

  /* ============================================================
   * 路由
   * ========================================================== */

  function setNav(name) {
    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-nav') === name);
    }
  }

  function route() {
    var view = A.$('#view');
    var hash = location.hash || '#/';
    var m;

    if ((m = hash.match(/^#\/run\/([a-z0-9_-]+)$/))) {
      var exp = A.get(m[1]);
      if (!exp) { location.hash = '#/'; return; }
      setNav('home');
      if (!A.hasConsent()) renderConsent(view, exp);
      else A.beginRun(exp.id, view);
      return;
    }

    if (hash === '#/results') {
      setNav('results');
      global.ALAB_RESULTS.render(view);
      return;
    }

    if (hash === '#/about') {
      setNav('about');
      renderAbout(view);
      return;
    }

    if (hash === '#/researcher') {
      setNav('');
      renderResearcher(view);
      return;
    }

    setNav('home');
    renderHome(view);
  }

  global.addEventListener('hashchange', route);
  global.addEventListener('DOMContentLoaded', route);
  if (document.readyState !== 'loading') route();
})(window);
