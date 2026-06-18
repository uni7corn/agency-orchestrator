# Cloudflare Pages Functions —— 让静态公开站「提示词优化」免费可用

这些边缘函数把「提示词优化 / 测试」这类**单次 LLM 调用**代理到 Agnes AI，
**API key 作为 Cloudflare 机密保存，永不进前端 / git**。完整多步工作流仍需本地引擎，不在此列。

## 启用步骤（Cloudflare Pages 后台）

1. **Project root / 根目录**：设为 `website`（functions 在 `website/functions/`，构建输出 `dist`）。
2. **Settings → Environment variables / Secrets**，新增：
   - `AGNES_API_KEY` = 你的 Agnes key（**设为 Secret，不要明文提交**）
   - 可选 `AGNES_MODEL`（默认 `agnes-2.0-flash`）、`AGNES_BASE_URL`（默认 `https://apihub.agnes-ai.com/v1`）
3. 重新部署。打开站点 → Studio →「提示词」页，无需本地引擎即可优化 / 实测。

## 防滥用（强烈建议）

免费额度暴露在公网，请在 Cloudflare 后台对 `/api/prompt/*` 加 **Rate limiting rule**
（如每 IP 每分钟 N 次）。函数内已做输入长度上限兜底，但限流要在 CF 侧配。

## 路由
- `POST /api/prompt/optimize` → 优化提示词
- `POST /api/prompt/test` → 用样例实测提示词

> 本地 `ao web`（Node 后端）有自己的 `/api/*` 实现，不走这些函数；二者互不冲突。
