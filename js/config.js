/* ============================================================
 * config.js —— 收数配置
 *
 * 当前状态（2026-11-04 已配置）：
 *   项目码 ULLZFN 已填入，自动上传已开启。被试完成实验后，
 *   数据会 POST 到 apiEndpoint，可在 /hw2 后台实时看到。
 *
 * 项目码是"公开"的：它写在前端，被试的浏览器会把它一起发出去，
 * 所以推送到公开仓库没有问题。
 *
 * 下载密钥是"保密"的：只用于你从后台下载数据，绝不写进这个文件、
 * 也不要贴进 README 或任何会被提交的地方。
 * ============================================================ */

window.ALAB_CONFIG = {
  // ① 6 位项目码，留空则只本地记录 + 导出 CSV
  projectCode: 'ULLZFN',

  // ② 收数接口（作业文档给定的地址，一般不用改）
  apiEndpoint: 'https://attention-lab-production.up.railway.app/api/hw2/submit',

  // ③ 填好 projectCode 后改为 true，被试完成实验即自动上传
  uploadEnabled: true,

  // ④ 每个条件的最低试次数（用于结果页校验数据完整性）
  minTrialsPerCondition: 10,

  // ⑤ 数据保留：即使上传成功，也在被试本机留一份（防丢）
  keepLocalBackup: true
};
