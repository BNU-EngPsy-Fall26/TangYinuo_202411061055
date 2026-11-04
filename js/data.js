/* ============================================================
 * data.js —— 被试数据（由 analysis/compute_effects.py 生成，勿手改）
 *
 * 结构：
 *   window.ALAB_DATA = {
 *     collectedAt: '2026-11-06T...',        // 生成时间
 *     source: 'hw2 export',                 // 数据来源说明
 *     submissions: [
 *       { participant:'P-XXX', experiment:'cb', condition:'within',
 *         submittedAt:'...', trials:[{cond,rt,correct,...}, ...] }
 *     ]
 *   }
 *
 * 为什么用 .js 而不是 .json：助教 clone 后直接双击 index.html（file:// 协议）
 * 也能打开，fetch 本地 JSON 会被浏览器拦截，而 <script> 不会。
 * ============================================================ */

window.ALAB_DATA = {
  collectedAt: null,
  source: '',
  submissions: []
};
