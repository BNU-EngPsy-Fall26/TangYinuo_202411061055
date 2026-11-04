# 注意实验室 · Attention Lab

工程心理学课程作业二：把三个经典注意范式做成可以在浏览器里直接跑的实验，每个实验都带一个**自己的改进条件**，其中改进以**新条件的形式真正收集了数据**来检验。

- 作者：汤一诺（202411061055）
- 课程：工程心理学 · 2026 秋
- 在线地址：https://bnu-engpsy-fall26.github.io/TangYinuo_202411061055/
- 项目码：`ULLZFN`（已在 `js/config.js` 中配置，自动上传已开启）
- 作业一（深海声呐 · 信号检测论实验室）留存于 [`archive/hw1/`](archive/hw1/)，不影响本作业运行

---

## 一、怎么跑

**最简单的办法**：直接双击 `index.html`。整个项目是纯前端，没有构建步骤、没有外部依赖、没有网络请求（除了上传收数那一步），`file://` 协议下也能完整运行。

**推荐的办法**（本地起个服务，行为最接近线上）：

```bash
git clone <本仓库地址>
cd <仓库目录>
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

**助教验收时值得看的四处**

| 入口 | 看到什么 |
| --- | --- |
| `index.html` | 三个实验的卡片，各自的出处、设计、改进点 |
| `#/results` | 结果页：效应量、t 检验、与原研究对照（数据来自 `js/data.js`） |
| `#/about` | 项目说明、数据字段、技术栈、AI 使用说明 |
| `#/researcher` | 研究者面板：收数配置状态 + 本机备份导出 |

---

## 二、三个实验

三个实验分属 W5、W6、W7 三周，跨越选择性注意、搜索与并行加工、显示设计三个主题，全部为**被试内设计**，每个条件 ≥10 试次，单个实验 5–7 分钟。

### 实验一：闪烁变化盲（W5）

- **出处**：Rensink, O'Regan & Clark (1997). *To see or not to see: The need for attention to perceive changes in scenes.* Psychological Science, 8(5), 368–373.
- **程序**：24 个彩色方块，画面以「画面 400 ms → 空白 130 ms → 画面 400 ms → 空白 130 ms」的节奏反复闪烁；其中有一个方块的位置发生轻微平移。被试判断这次变化是否发生在**蓝色**方块上。
- **自变量**：变化位置（目标色 / 非目标色），被试内，各 12 试次。
- **因变量**：检测反应时（ms，从首次呈现起算）、正确率。
- **我的改进**：把「变化盲」从"有没有注意"推进到"注意集是否匹配"。经典范式只问"有没有看到变化"，本研究全程要求被试监测蓝色方块，而变化物体一半是蓝色、一半不是——于是问题变成：**与当前注意定势不一致的变化，是不是更难被看见**。这是 Rensink 等（1997）"注意是看见变化的前提"这一命题的可证伪版本，理论依据取自 Most 等（2001）的注意定势研究。
- **预测**：目标色条件检测更快、更准；非目标色 − 目标色的 RT 差值为正，dz 中等以上（0.5–0.9）。
- **如果预测失败意味着什么**：说明被试实际上把整个画面当作监控对象（未形成有效注意集），或者位置平移的幅度足够大、足以在无注意条件下被捕获。

### 实验二：低流行率视觉搜索（W6）

- **出处**：Wolfe, Horowitz & Kenner (2005). *Rare items often missed in visual searches.* Nature, 435, 439–440.
- **程序**：25 个可任意旋转的字母，**目标是一个 T，干扰项全是 L**（经典 T-among-L 搜索）；被试判断这一屏里有没有 T，有按 F，无按 J，单试次上限 4 s。T 与 L 的差别在结构（横杠居中压在竖杆上 vs 横杠与竖杆在端点相接），不依赖朝向，因此指导语可以唯一界定目标，也保证搜索是串行的。
- **自变量**：目标流行率与反馈，被试内三水平——`high` 50% / `low` 10% / `lowfb` 10% + 每试次即时反馈，各 30 试次。
- **因变量**：漏报率、虚报率、d′、判断标准 c。
- **我的改进**：Wolfe 等把低流行率下的漏报归因于**判断标准漂移**（少见 → 默认"没有"），而不是知觉失败。这个解释可以直接检验：在低流行率组块里加入**每试次即时反馈**（告知对错、并明确本试次到底有没有目标，相当于"虚拟目标"机制的简化版）。如果漏报源于标准漂移，反馈应当压低漏报率、把 c 拉回 0；如果源于知觉限制，反馈就不该有用。
- **预测**：`low` 的漏报率显著高于 `high`（复现）；`lowfb` 的漏报率低于 `low`、c 变小（改进生效）。
- **设计取舍**：原文用 1%–2% 的极低流行率，本研究用 10%，是为了在 30 试次/条件内保留可分析的目标试次。代价是效应量会比原文小。

### 实验三：比例判断（W7）

- **出处**：Cleveland & McGill (1984). *Graphical perception: Theory, experimentation, and application to the development of graphical methods.* JASA, 79(387), 531–554. / Hollands & Dyre (2000). *Bias in proportion judgments: The cyclical power model.* Psychological Review.
- **程序**：呈现堆叠条形图或饼图，深色部分占整体的比例在 .20–.80 之间；被试拖动滑块估计"深色部分占整体的百分之多少"。
- **自变量**：2（图形：堆叠条形图 / 饼图）× 2（刻度线：无 / 有 .25、.50、.75 刻度），被试内，每格 10 试次，共 40 试次。
- **因变量**：判断误差 = |估计百分比 − 真实百分比|（百分点）。
- **我的改进**：给图形加 .25/.50/.75 刻度线。依据 Hollands & Dyre 的"锚点"解释：比例判断的偏差来自参照不足，那么补上参照点应当降低误差，而且对依赖**角度编码**的饼图帮助更大。这给出一个可证伪的交互预测，而不只是"加个刻度看看"。
- **预测**：① 复现：饼图误差 > 条形图；② 改进：有刻度时误差下降；③ 交互：饼图的改善量 > 条形图的改善量。

---

## 三、预测（**收数前提交**）

> 本节于 2026-11-04 完成并首次提交，**早于任何数据收集**。后续实验结果无论支持与否，本节不作修改——这是作业要求，也是我对自己预注册的约束。

| 编号 | 实验 | 预测 | 判定指标 | 预期方向 |
| --- | --- | --- | --- | --- |
| H1a | 变化盲 | 目标色变化的检测快于非目标色 | 配对 t（RT） | 非目标色 − 目标色 > 0，dz ≈ 0.5–0.9 |
| H1b | 变化盲 | 目标色变化的正确率更高 | 配对 t（正确率） | 差值 > 0 |
| H2a | 低流行率 | 低流行率的漏报率高于高流行率 | 配对 t（漏报率） | low − high > 0 |
| H2b | 低流行率 | 即时反馈降低低流行率下的漏报 | 配对 t（漏报率） | lowfb − low < 0 |
| H2c | 低流行率 | 反馈使判断标准变宽松 | 配对 t（c） | c(lowfb) − c(low) < 0 |
| H3a | 比例判断 | 饼图误差大于条形图 | 配对 t（|误差|） | 饼 − 条 > 0 |
| H3b | 比例判断 | 刻度线降低判断误差 | 配对 t（|误差|） | 有刻度 − 无刻度 < 0 |
| H3c | 比例判断 | 饼图从刻度线中受益更大 | 交互（Δ饼 − Δ条） | Δ饼 − Δ条 > 0 |

**我对结果的先验判断**：H1a、H2a、H3a、H3b 我比较有信心（都是被反复复现的现象）；H2b/H2c 最不确定——反馈能不能压住低流行率效应，取决于它作用在标准上还是作用在知觉上；H3c 是纯粹的推断，如果交互不成立，说明刻度线的收益与图形编码方式无关，这本身也是个有意思的结论。

---

## 四、收数配置

被试端的数据流向由 `js/config.js` 控制：

```js
window.ALAB_CONFIG = {
  projectCode: '',          // ← 填 /hw2 项目页给的 6 位项目码
  apiEndpoint: 'https://attention-lab-production.up.railway.app/api/hw2/submit',
  uploadEnabled: false,     // ← 填好项目码后改为 true
  minTrialsPerCondition: 10,
  keepLocalBackup: true
};
```

### 从拿到项目码到被试能做的完整流程

**这一步必须在收数之前完成**——页面是静态文件，`config.js` 改完要重新推送才生效；没部署就没法把链接发出去，没填项目码数据就传不进后台。

```bash
# 1. 克隆仓库（假设已经在课程组织下建好了仓库）
git clone git@github.com:BNU-EngPsy-Fall26/TangYinuo_202411061055.git
cd TangYinuo_202411061055

# 2. 把本项目的内容放到仓库根目录（不要套一层文件夹）
cp -r /path/to/attention-lab/* .

# 3. 改配置：编辑器打开 js/config.js，把两处改掉
#    projectCode: 'ABC234'
#    uploadEnabled: true

# 4. 本地先自测一遍（不联网也能跑，只有上传需要网络）
#    直接双击 index.html，或在目录下执行：
python -m http.server 8000   # 然后访问 http://localhost:8000

# 5. 提交 + 推送（这次提交同时包含"收数前的预测"，见第三节）
git add .
git commit -m "预注册：收数前提交实验程序、预测与收数配置"
git push

# 6. 开 GitHub Pages：仓库 Settings → Pages → Source 选 main / root
#    1–2 分钟后链接生效，形如：
#    https://bnu-engpsy-fall26.github.io/TangYinuo_202411061055/
```

**验证配置是否真的生效**：打开线上链接 → 页面右下角「本机缓存导出」→ 应显示「项目码：ABC234　自动上传：已开启」。
若显示"未填写/未开启"，说明改动没推上去或 Pages 还没刷新（Ctrl+F5 强刷）。

**自测产生的数据要剔除**：自己跑一遍以验证上传通路是必要的，但那条记录会进数据集。记下自测时的匿名编号，导出分析时用 `--exclude` 排掉（见第六节）。

**关于项目码的公开性**：项目码本来就写在前端、被试浏览器会把它一起发出去，所以推到公开仓库没问题；**下载密钥是保密的**，只用于你从后台下数据，绝不能写进任何会被提交的文件。

**上传的记录格式**（与作业文档给的示例一致）：
```json
{
  "project": "ABC234",
  "experiment": "cb",
  "participant": "P-4K7Q2M",
  "condition": "within",
  "trials": [
    { "cond": "inset", "rt": 3820, "correct": true, "resp": "yes", "timeout": 0 }
  ]
}
```

各实验的试次字段：

| 实验 | 试次字段 |
| --- | --- |
| `cb` | `cond`（inset/outset）、`rt`、`correct`、`resp`（yes/no/timeout）、`timeout` |
| `lp` | `cond`（high/low/lowfb）、`present`（1/0）、`resp`、`rt`、`correct`、`timeout` |
| `cm` | `cond`（bar/pie × ticks/noticks）、`format`、`ticks`、`truePct`、`estimate`、`errSigned`、`absErr`、`rt` |

**三条数据安全措施**：① 接口上传失败会自动重试一次；② 无论上传成功与否，被试浏览器都留有一份本机备份；③ 结束页始终提供 CSV 下载，被试可以手动把数据发给主试。

**匿名性**：编号形如 `P-4K7Q2M`，在本机自动生成，不采集姓名、学号、IP、设备指纹。项目码是公开的（写在页面代码里），下载密钥不写入任何前端文件。

---

## 五、数据收集记录

| 日期 | 渠道 | 完成人数 | 备注 |
| --- | --- | --- | --- |
| （待填） | | | |

目标：≥5 人（作业底线），争取 ≥10 人（加分项）。

**提交分两次，顺序不能反**：

| 时机 | 提交内容 | 作用 |
| --- | --- | --- |
| **收数前**（第一次 push） | 实验程序 + `config.js` + README 的「预测」一节 | 预注册。作业要求预测在收数前提交，提交时间戳就是证据 |
| **收数后**（最后一次 push） | `js/data.js` + README 的「结果与讨论」「数据收集记录」+ 结果页截图 | 交付结果 |

换句话说：**不能先收数再补代码和预测**——那时页面还不存在，链接发不出去，数据也没地方传。收数本身依赖已经部署好的页面。

---

## 六、结果与讨论

结果页（`#/results`）的统计全部由 `js/data.js` 中的试次级数据在浏览器里现场计算，不写死任何数字。更新数据的流程：

```bash
# 1. 从 /hw2 后台下载 JSON 或 CSV（也可以收集被试发来的 CSV 放进一个目录）
# 2. 生成数据文件，同时在终端打印一份描述统计
#    --exclude 用来剔除自测/演示数据；--min-trials 过滤中途退出的
python analysis/compute_effects.py --in 导出文件.json --summary \
    --exclude P-4K7Q2M --min-trials 20
# 3. 刷新网页的 #/results
```

统计口径：

- 配对 t 检验（双尾），效应量报告 Cohen's dz；
- 信号检测指标 d′ 与 c 采用 log-linear 校正（(hits+0.5)/(n+1)），避免 0/1 比例导致无穷；
- n < 8 时以效应量方向为主，不做过强的推断性解读；
- 正式写进报告前，建议用 R / JASP 复核一遍关键检验。

> **结果数据待填**：收数完成后，把 `analysis/compute_effects.py --summary` 的输出贴到下面，并补写讨论。
>
> - 实验一：
> - 实验二：
> - 实验三：
>
> **讨论要点（收数后补）**：预测是否成立 / 与原文差异的原因（流行率设置、试次数、被试群体）/ 本研究的局限（样本量、单次施测、变化盲的试次间污染）/ 如果重做会改什么。

---

## 七、代码结构

```
attention-lab/
├── index.html              单页应用入口（hash 路由）
├── css/
│   └── style.css           全部样式，手写、无框架、含手机适配
├── js/
│   ├── config.js           收数配置（项目码、接口、开关）
│   ├── core.js             实验引擎：编号、同意、试次循环、计时、上传、CSV
│   ├── stats.js            统计函数：t 检验、p 值、效应量、置信区间、正态分位数
│   ├── data.js             被试数据（由 analysis 脚本生成，勿手改）
│   ├── exp1-cb.js          实验一：闪烁变化盲
│   ├── exp2-lp.js          实验二：低流行率搜索
│   ├── exp3-cm.js          实验三：比例判断
│   ├── results.js          结果页渲染与现场统计
│   └── app.js              路由、首页、知情同意、说明页、研究者面板
├── analysis/
│   └── compute_effects.py  数据流水线：导出文件 → js/data.js + 终端汇总
└── README.md
```

设计上的几个决定：

- **不用框架、不用构建**：助教 clone 后双击就能跑，不必 `npm install`。
- **数据用 `js/data.js` 而不是 `data.json`**：`file://` 下 `fetch` 本地 JSON 会被浏览器拦截，`<script>` 不会。
- **计时只用 `performance.now()`**：单调时钟，不受系统时间调整影响；反应时从刺激呈现那一刻起算，不做 `Date.now()` 混用。
- **刺激画在 `<canvas>` 上**：保证帧级呈现控制，也避免 DOM 重排引入的延迟。
- **键盘 + 屏幕按钮双通道**：手机被试没有键盘也能做，招募时不必限定设备。

---

## 八、AI 使用说明

按课程要求如实说明：

**用了 AI 做什么**：程序实现层面——三个实验的前端代码、canvas 刺激绘制、统计函数（t 分布、效应量、置信区间）、数据流水线脚本、README 的结构化撰写，均在 AI 助手（WorkBuddy）辅助下完成；我也用 AI 检查过代码中的边界情况（例如某条件下试次为空、`localStorage` 在 `file://` 下不可用时如何降级）。

**哪些是我自己做的、不由 AI 代劳**：三个实验的**选择与搭配**（为什么是这三个、为什么跨 W5–W7）、每个实验的**改进思路**（注意集操纵、反馈干预、刻度线）、**假设与预测的方向和幅度**、以及收数后的**结果解释与讨论**。选题依据来自课堂与文献，预测在收数前写定并提交，AI 没有看到任何被试数据。

**没有做的事**：没有让 AI 生成或篡改数据，没有使用任何现成的注意实验代码库（可参考 Attention Lab 的设计思路，但代码为自行实现）。

---

## 九、参考文献

1. Rensink, R. A., O'Regan, J. K., & Clark, J. J. (1997). To see or not to see: The need for attention to perceive changes in scenes. *Psychological Science*, 8(5), 368–373.
2. Most, S. B., Simons, D. J., Scholl, B. J., Jimenez, R., Clifford, E., & Chabris, C. F. (2001). How not to be seen: The contribution of similarity and selective ignoring to sustained inattentional blindness. *Psychological Science*, 12(1), 9–17.
3. Wolfe, J. M., Horowitz, T. S., & Kenner, N. M. (2005). Rare items often missed in visual searches. *Nature*, 435, 439–440.
4. Cleveland, W. S., & McGill, R. (1984). Graphical perception: Theory, experimentation, and application to the development of graphical methods. *JASA*, 79(387), 531–554.
5. Hollands, J. G., & Dyre, B. P. (2000). Bias in proportion judgments: The cyclical power model. *Psychological Review*, 107(3), 500–524.
6. Simons, D. J., & Chabris, C. F. (1999). Gorillas in our midst: Sustained inattentional blindness for dynamic events. *Perception*, 28(9), 1059–1074.
