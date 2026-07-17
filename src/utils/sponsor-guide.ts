/**
 * 无凭证引导（Studio 横幅 / CLI ② 路径）的赞助商位——CLI 与 web 服务共用这份数据。
 *
 * 档位规则（2026-07 与赞助商约定）：
 * - 进阶档（多元探索）固定第一位：这是进阶 vs 标准的差价权益，不参与轮换
 * - 标准档（¥800 档）按天轮换第二位：同档等份轮值，谁也不吃独食；
 *   也避免多个"注册送 X"并排稀释进阶档的转化
 */

export interface SponsorGuideEntry {
  name: string;
  bonus?: string;
  url: string;
}

/** 进阶档：固定第一位（provider id: duoyuanx） */
export const PREMIUM_SPONSOR: SponsorGuideEntry = {
  name: '多元探索',
  bonus: '注册送 3 元',
  url: 'https://duoyuanx.com/register?aff=LErO',
};

/** 标准档轮换池（顺序无偏好，轮值即公平） */
export const STANDARD_SPONSOR_ROTATION: SponsorGuideEntry[] = [
  { name: 'CCSub', bonus: '注册送 $5', url: 'https://www.ccsub.net/register?ref=8G5W4JK4' },
  { name: 'Cubence', bonus: '首购 9 折', url: 'https://cubence.com/signup?code=SCW29JP9&source=agency' },
  { name: '优云智算', bonus: '注册送 5 元', url: 'https://passport.compshare.cn/register?referral_code=ETD3L5JBM13CtKARkMORot&ytag=GPU_YY_YX_git_agency-agents' },
  { name: '火山引擎', bonus: '注册领 2500 万 Tokens', url: 'https://www.volcengine.com/activity/ai618?utm_campaign=hw&utm_content=hw&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=agency-agents-zh' },
  { name: 'RootFlowAI', bonus: '进群领 $10', url: 'https://rootflowai.com/register?utm_source=agency-agents-zh&utm_medium=sponsor&utm_campaign=web' },
];

/** 当天轮值的标准档赞助商（按自然日等份轮换，确定性、可向赞助商解释） */
export function rotatingStandardSponsor(now: number = Date.now()): SponsorGuideEntry {
  return STANDARD_SPONSOR_ROTATION[Math.floor(now / 86_400_000) % STANDARD_SPONSOR_ROTATION.length];
}
