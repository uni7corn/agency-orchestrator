# Agency Orchestrator — 自动研究循环日志

> 目标：让 AO 的**构建（compose/run）流程更省钱、更实用、更让用户想用**。
> 方法：科学循环「提假设 → 做实验 → 记录 → 迭代」，至少 3 组实验。
> 总指挥：Claude **Opus 4.8**（`claude-opus-4-8`）。研究以**代码取证 + 量化估算**为主，
> 不擅自消耗用户 API 预算（这本身契合「省钱」目标）。每条结论标注**置信度**。
> 首次运行：2026-07-07。

---

## 方法论与基线

- **数据源**：`src/core/executor.ts`（执行/上下文/token 计费）、`src/core/compose.ts`（自动组队）、
  `src/cli/`、`README.md`、`agency-agents-zh/`（216 角色）。
- **成本模型**：每步 LLM 输入 = `agent.systemPrompt` + `renderTemplate(step.task, context)`
  （executor.ts:386/398/432 `inputChars = systemPrompt.length + userMessage.length`）。
- **置信度记法**：🟢高（代码直接佐证）/ 🟡中（推断+局部佐证）/ 🔴低（需实测验证）。

---

## 实验 1 —— 构建流程的 token/成本剖析（省钱）

**假设**：compose/run 每步会把大量上游输出灌进 prompt，存在可裁剪的冗余 token。

**方法**：读 `executor.ts` 的上下文拼装与计费路径，定位 token 去向。

**发现**：
1. 🟢 引擎**不乱灌**：`userMessage = renderTemplate(node.step.task, context)`（executor.ts:398）——
   一步的输入**只包含它的 task 模板里 `{{var}}` 显式引用的变量**，不是把所有上游 output 全塞。
   设计已经是「按需引用」。
2. 🟢 引擎甚至内置了反冗余提示（executor.ts:321）：「收窄输入：只用 depends_on 引用必要的上游
   output，别把全部上游灌进 task」——说明**过度引用是用户侧模板写法问题，不是引擎缺陷**。
3. 🟢 真正的成本大头是两块，与「灌上游」无关：
   - **角色 system prompt 长度**：216 个角色，部分人设很长，每步都全量带上；
   - **无跨步/跨重试的 prompt 缓存**：同一次 run 内，重试、loop 回跳会重复发送相同 system prompt；
     同一角色的 system prompt 是静态的，Anthropic 等支持 **prompt caching** 可省重复输入费。

**结论**：假设**部分证伪**——冗余不在引擎灌上游，而在 (a) 角色 prompt 体量、(b) 无缓存。

**建议（按 ROI）**：
- 🟢 **R1.1 prompt caching（Claude 系）**：对 `agent.systemPrompt` 打 cache 断点，命中重试/loop/
  同角色复用场景。Anthropic 缓存读取约为写入的 1/10 价。*收益：重试/循环多的工作流可省两位数百分比输入费；风险：低（provider 特性，可灰度）。需用户确认再动 connector。*
- 🟡 **R1.2 角色 prompt 瘦身基线**：统计各角色 systemPrompt 字符数，给最长的 N 个出「精简版」，
  按 token 预算裁剪样板话术。*收益：全局每步省固定量；风险：可能掉人设质量，需盲评。*
- 🟢 **R1.3 模板纪律 lint（低风险，建议先做）**：`ao validate` 增加一条**软告警**——当某步 task 引用了
  未在 `depends_on` 声明的 output，或引用了体量很大的上游变量时提示收窄。*纯提示不改行为，零回归风险。*

---

## 实验 2 —— 首次上手摩擦（更想用）

**假设**：新用户从「装好」到「第一次成功出结果」的路径过长/易卡，劝退。

**方法**：走查 `README` 首条命令 + 零配置路径（recommended provider / 免 key CLI / 模板）。

**发现**：
1. 🟢 入口很好：`ao compose "…" --run` 一条命令 = AI 自动拆解+组队+并行执行（README:53）。心智负担低。
2. 🟢 已有零配置助攻：探测本机已装订阅制 CLI → 推荐零配置路径（web `recommended` 逻辑）。
3. 🔴 **断点**：全新用户**既没配 key、也没装 CLI** 时，`--run` 无法真跑 → 第一步就撞墙。
   免 key 路径（本地 Ollama / 已登录 CLI）对新手不显然；付费 key 又是门槛。
4. 🟡 赞助商里已有**注册送额度**的选项（如本轮新加的 **CCSub 注册送 $5**、Cubence 等）——
   这正是「零成本起步」的天然入口，但首次上手流程没把它顶到用户面前。

**结论**：假设**成立**——瓶颈是「无凭证的第一步」。

**建议（按 ROI）**：
- 🟢 **R2.1 首跑引导（高 ROI，低风险）**：`ao compose --run` 检测到无可用 provider 时，不报错退出，
  而是打印一段「三选一」引导：① 本机已装 CLI（零配置）② 送额度赞助商（贴 CCSub $5 / Cubence 注册链，
  30 秒拿 key）③ 本地 Ollama。*把「撞墙」变「选路」。纯 CLI 文案+分支，可测，低回归。*
- 🟡 **R2.2 Studio 首跑同款引导**：网页端 Providers tab 顶部，无 key 时高亮「送额度」赞助商卡。
- 🟡 **R2.3 `ao doctor`**：一条命令自检「provider/key/CLI/网络」并给出下一步，降低排障摩擦。

---

## 实验 3 —— 模型档位性价比（省钱不掉质）

**假设**：工作流里部分步骤（抽取/格式化/汇总/改写）用更便宜的模型，质量不掉，但成本大降。

**方法**：查引擎是否支持 per-step 模型覆写；查 compose 是否利用它。

**发现**：
1. 🟢 **引擎已完整支持每步覆写**：`const stepLlm = node.step.llm`（executor.ts:407），
   provider/model/base_url/api_key/timeout/retry 均可按步覆盖，凭证变更时自动重建 connector。
   → **「贵/便宜混用」的底层能力现成，零缺口**。
2. 🟢 **compose 不利用它**：`ao compose` 自动组队时所有步骤共用一个全局 `llm`，
   不按步骤复杂度分配档位。→ **能力有，但没人自动用**。
3. 🟡 成本量级估算（置信度中，需实测校准）：典型 5 步工作流中，约 2–3 步属「低推理强度」
   （结构化抽取、汇总、润色、格式化）。若这些步走 ~1/10 单价的便宜档，且它们约占 35–45% 输入 token，
   则整体成本**可降约 30–40%**，而对最终质量影响集中在「难步」（架构/创意/判断），这些仍用强模型即可。

**结论**：假设**成立且高价值**——这是本轮**最高 ROI 的省钱机会**。

**建议（按 ROI）**：
- 🟡 **R3.1 compose 自动分档（高 ROI，中风险）**：给每个角色/步骤打「推理强度」标签（strong/light），
  compose 时把 light 步骤的 `step.llm.model` 设为便宜档，strong 步骤保持强模型。
  *收益：~30–40% 省钱预估；风险：需盲评确认不掉质，建议接 `eval/run-eval.ts` 门禁验证后再默认开启。*
- 🟢 **R3.2 `--budget` 开关（低风险，建议先做）**：`ao compose --run --budget` = 显式开启自动分档，
  默认关。让用户自愿尝鲜、可回退，不改默认行为 → 零回归。
- 🟢 **R3.3 文档化能力**：README/CLAUDE.md 补一节「省钱：给某步 `llm.model` 指定便宜模型」，
  把现成但隐藏的 per-step 覆写能力显性化。*零风险，立刻可做。*

---

## 汇总：ROI 排序（给用户拍板）

| 编号 | 方案 | 收益 | 风险 | 建议 |
|---|---|---|---|---|
| R3.1 | compose 自动模型分档 | 省钱 ~30–40%（估） | 中（需盲评） | **主力**，接 eval 门禁后默认开 |
| R2.1 | 首跑无凭证引导 | 拉高首次成功率 | 低 | **先做**，直接提留存 |
| R1.1 | Claude prompt caching | 省重复输入费 | 低-中 | 值得做，需动 connector，用户确认 |
| R3.2 | `--budget` 开关 | 让 R3.1 可控落地 | 极低 | **先做**，R3.1 的安全外壳 |
| R1.3 | 模板纪律软告警 | 教育用户省 token | 极低 | 顺手做 |
| R3.3 | 文档化 per-step 模型 | 显性化现成能力 | 零 | **立刻做** |
| R2.3 | `ao doctor` 自检 | 降排障摩擦 | 低 | 可做 |
| R1.2 | 角色 prompt 瘦身 | 全局省固定量 | 中（掉人设） | 需盲评，缓做 |

**一句话结论**：AO 引擎的省钱地基（按需引用 + 每步可换模型）**已经打好**，
最大的浪费不是引擎，而是 **compose 没有把「便宜模型用在简单步」这件事自动做掉**（R3.1）+
**新用户第一步无凭证就撞墙**（R2.1）。这两条一个直接省钱、一个直接提留存，是本轮最值得投入的。

---

## 补充实测数据（迭代 2 · 免费分析，为 R1.2/R3.1 提供底数）

**角色 system prompt 体量**（`node_modules/agency-agents-zh`，每步都全量随请求发送）：

| 指标 | 值 | 成本含义 |
|---|---|---|
| 角色数（含 README 等非角色 md） | 235 个 md | — |
| 单角色 prompt 中位 | ~5,611 字符（≈ **2.2K token/步**） | 每步固定「入场费」 |
| 平均 | ~6,772 字符 | — |
| 最重角色 | 28,651 字符（recruitment-specialist，≈ **1 万 token**） | 该角色每步就烧 1 万输入 token |
| >6,000 字符的重 prompt | **110 个（46%）** | R1.2 瘦身优先目标 |

**推论**：一个 5 步工作流，光「角色 system prompt」的固定输入成本就约 5 × 2.2K = **~11K token**，
与用户任务内容无关。若把重 prompt 角色（尤其做「轻活」时）换便宜档（R3.1）或瘦身（R1.2），
省的是这块「每步都付」的固定费。**佐证 R3.1 是最大省钱杠杆**。

## 已落地（本轮安全改进，均已测试）

- 🟢 **R3.3 示范工作流**：新增 `workflows/省钱混用示例.yaml` —— 用 per-step `step.llm` 覆写演示
  「轻活走便宜档 deepseek-chat、重活走强推理档 deepseek-reasoner」。`ao validate` 通过，
  且**全 32 个工作流批量校验 0 失败**（未破坏既有目录）。把隐藏能力变成可抄模板。
- 中风险项（R3.1 compose 自动分档、R1.1 prompt caching、R2.1 首跑引导）**列为待用户拍板**，
  不擅自改默认行为 / 不擅自烧 API 预算（契合「省钱」目标）。

## 迭代记录

- 2026-07-07 迭代 1：完成 Exp1–3（代码取证），产出 ROI 排序表。
- 2026-07-07 迭代 2：免费实测角色 prompt 体量，量化 R1.2/R3.1 底数；落地并测试 R3.3 示范工作流。
- 2026-07-07 迭代 3（用户批准后实装 R2.1 + R3.1/R3.2）：

  **R2.1 首跑引导（已实装 + 双向测试）** —— `src/cli.ts`：`ao compose`/`--run` 检测到无凭证时，
  打印「三选一」路径（本机已装 CLI 零配置 / CCSub·Cubence 送额度中转 / 本地 Ollama）而非抛晦涩错误。
  测试：无凭证 deepseek → 出引导且智能推荐本机 claude-code ✅；有 key → 不误拦（0 次误触发）✅。

  **R3.1/R3.2 `--budget` 自动分档（已实装 + 实机验证）** —— `src/cli/compose.ts`：
  `ao compose --budget` 把「轻活」步骤（抽取/汇总/格式化/罗列/翻译/润色）降到便宜档，
  「重活」步骤（分析/设计/评审/创作/判断）保持强档；保守策略（不确定一律保强档），默认关=零回归。
  per-provider 便宜档表：claude/relay→haiku，openai→mini，deepseek 已便宜→no-op。
  - 单测：轻活降档、重活保档、降档后 YAML 校验通过 ✅
  - **真实工作流实机验证**（claude-code 生成「调研→竞争分析→撰写报告」）：调研步降 haiku，
    **竞争分析+撰写报告两个质量关键步保持强档**，校验通过 ✅ —— 分类器在真实产出上正确且保守。
  - ⚠️ **质量盲评待用户批准预算**：降档只对 API provider 生效，本地 CLI 无档位映射，
    「haiku 干轻活是否影响最终质量」需真跑 API 做 A/B 盲评。设计上已把质量关键步锁强档，风险已收敛。

  **桌面/web 两端** —— 关键结论：**桌面端 = Electron 套 `web/server.js`，与 web 共用同一后端**。
  `/api/compose` 已加 `budget` 透传（一处生效两端受益）+ 前端 `api.compose` 加 `budget` 参数。
  UI 开关（Studio 组队页加个「省钱模式」勾选）留作低风险后续。

- 2026-07-07 迭代 4（用户给 deepseek key，实跑质量盲评）：

  **R3.1 质量盲评实测（N=3，deepseek，位置翻转去偏）** —— 关键且反直觉的结果：
  - 设置：同一任务，**control=全 deepseek-reasoner（贵档）** vs **budget=gather 降 deepseek-chat + analyze/format 保 reasoner**，各跑 3 次。
  - 盲评（deepseek-chat 当 judge，奇数对翻转位置消除位置偏差）：**control 3/3 全胜，差距均判 "large"**。
  - **但机制存疑**：单独看被降档的 `gather` 产出，chat 版与 reasoner 版**质量相当**（chat 版甚至更新，提到 Cline/Windsurf）。
    最终差异更可能来自 **reasoner 创作步的运行间高变异 + 单一 judge 的风格偏好**，而非降档本身 → **因果不牢**。
  - **confound**：单任务、单 judge 模型、n=3、reasoner 输出高变异、deepseek-chat↔reasoner 是异常大的能力落差。
  - **稳健结论**：数据**不支持「budget 是免费午餐」**。`--budget` **必须保持默认关**，定位为「省钱换质量的取舍旋钮」，
    不是无损优化。tier 落差越大越危险；小落差（如 sonnet↔haiku）可能更安全，但需另做干净实验（多任务/多judge/控变异）验证。
  - **决策影响**：**验证了「默认关、opt-in」的保守设计**；明确**不把 --budget 设默认**。研究循环达成目的——证伪乐观假设、拦下坏默认。

  **Studio 省钱模式 UI（已做）**：RolesPicker 加「省钱模式」勾选 → 传 budget 给 /api/compose（中英 i18n），默认不勾。
  文案已如实写明「省钱不掉**关键**质量」（强调关键步保强档），不夸大成无损。

- 2026-07-07 迭代 5（方差对照实验 —— 决定性，推翻迭代 4 的结论）：

  **先修分类器**（已实装）：加 `REFORMAT_RE`（整理成/格式化/翻译成…）优先级高于 HARD，
  修掉 `format` 步因 task 引用「洞察」被误判为重活的 bug。现 `format`→轻活→便宜档，`analyze`→重活→强档，2/3 降档。单测通过。

  **A/A 方差对照（决定性）**：control（全 reasoner）跑 3 次，budget 跑 3 次。
  - **A/A**（reasoner 自己跟自己比，同配置，理应≈无差异）：judge 判 **large, large, large（3/3）**
  - **A/B**（control vs budget）：judge 判 **large, large, large（3/3）** —— 与 A/A **完全相同**
  - **结论：所谓「budget 掉质 large」是纯运行间变异噪声，与 budget 无关。** 两个相同配置的运行之间，
    judge 照样判「large 差距」。迭代 4 的「budget 输 3/3」**予以撤回——是噪声，不是效应**。

  **修正后的稳健立场**：
  - ❌ **撤回「budget 掉质」**：无任何证据支持；之前的「证据」是创作类任务的高变异 + 单一 judge 过度判差。
  - ⚠️ **budget 真实质量影响仍未知**：现装置（单创作任务 + deepseek-chat judge）**信噪比不足以测量**，不是有效仪器。
  - ✅ **方法论收获**：A/A 对照是这类 LLM 盲评的必需项——没有它，任何 A/B 结论都可能是变异冒充效应。
    本轮研究循环最大价值 = **用方差对照拦下了一个假结论**（既没错判 budget 好、也没错判 budget 坏）。
  - **实践决策不变**：`--budget` 保持默认关、opt-in；文案不吹「无损」也不吓「掉质」，如实说「省钱、关键步保强档、影响未定」。

- 2026-07-07 迭代 6（加 temperature 支持 + 用 temp=0 给 budget 终极定论）：

  **新功能：temperature 支持（已实装 + 验证）** —— `LLMConfig.temperature`，openai-compatible/claude/ollama
  请求体按需带上，parser 整体透传（顶层 llm + per-step llm 均可设）。这是个**独立有价值的实用功能**：
  控制确定性/创造性、可复现运行（省重复调试成本）。**验证：deepseek-chat temp=0 → 两次输出完全一致 ✅**。

  **用 temp=0 攻 budget 盲评 → 得到终极定论**：
  - A/A（两次 control，全 reasoner，temp=0）逐步对比：`gather` 不同、`analyze` 不同、`format` 偶合一致。
  - **决定性发现：deepseek-reasoner 忽略 temperature，temp=0 下仍不确定**（推理模型照样采样思维链）；
    而 deepseek-chat 确定。
  - **因此这套 budget 盲评仪器"无法去噪"**：强档(reasoner)本身不可确定，两臂的 `analyze` 步都用它 →
    最终产出的运行间变异**无法用 temperature 压掉**，少样本 A/B judge 必被变异淹没。这**彻底解释了迭代 4/5 的噪声**。

  **budget 质量问题——终极结论（本轮研究循环对此题的收官）**：
  - 用 deepseek 的档位对（chat↔reasoner），**强档不可确定 → budget 的质量效应用现有工具根本测不出**（不是"还没测"，是"这套装置测不了"）。
  - **无任何证据表明 budget 掉质**；设计上关键步锁强档，风险已收敛。
  - **要拿到定论，必须换"可确定的强档"**：如 Claude-sonnet / GPT 在 temp=0 下（非推理模型，吃 temperature）跑 A/A+A/B —— 需对应 API key。
  - **决策不变**：`--budget` 默认关、opt-in、文案如实（省钱、关键步保强档、影响未定）。

- 2026-07-07 迭代 7（R2.2 网页/桌面首跑引导 —— 判断为「最该弄」的一项，已实装+测试）：
  发现真空：web `/api/compose` 的 `buildLLMConfig` **不检查凭证**，默认 provider `apinebula` 无 key 时新用户点「自动组队」→ 底层连接器抛晦涩错。
  **这才是绝大多数用户（Studio 网页/桌面同一后端）会撞的第一堵墙**，而迭代 3 的 R2.1 只堵了 CLI。
  实装：`composeProviderReady()` 守卫 + 无凭证时返回结构化 `{code:no_credentials, installedCli, sponsors}`；
  `postJSON` 把错误体挂到 Error 上；RolesPicker 渲染「三选一」引导卡（本机 CLI / 送额度赞助商 CCSub·Cubence 可点链接 / 本地 Ollama），中英 i18n。
  测试：无凭证→返回引导（含检测到的 claude-code + CCSub $5）✅；已装 CLID→放行✅；守卫在写盘前返回**无污染**；web-server 测试 21/0、前端 build 全过。

- **下一步（待用户 go）**：若要 budget 定论 → 提供 Claude/GPT key，用非推理强档 temp=0 跑干净盲评（A/A 应塌到 none，A/B 才有效）；
  R1.1 Claude prompt caching（确定性省钱、不赌质量，需 Claude 环境验证）。

- 2026-07-07 迭代 8（补全 `--temperature` CLI）：`ao compose` / `ao run` 均加 `--temperature`（0~2，非法/越界拒绝），
  写入 llmConfig / llmOverride。补掉「温度只能写 YAML」的半成品。测试：非法值拒绝✅、`ao run --temperature 0` 两次输出一致✅、CLI/compose 测试全过。

- 2026-07-07 迭代 9（`ao doctor` 环境自检 —— 直击本会话反复出现的凭证/配置摩擦）：
  新命令 `ao doctor`：一条命令查 ①已装 CLI ②env 已配 key 的 provider ③默认 provider 是否就绪 ④系统 Claude Code 是否被劫持（复用 claude-repair 诊断）；
  就绪则「一切就绪」，有问题则打印首跑三选一引导。`ao doctor --fix`：检测到 ~/.claude 被劫持时**一键清除恢复**（写前备份）——
  把本会话开头那个「claude-code 被写坏只能手动/网页修」的灾难，变成一条 CLI 急救命令。
  已加进 --help（中英）+ CLAUDE.md 命令表。测试：真实环境自检✅、隔离目录 --fix 急救✅（检测→清除→备份→恢复干净）、CLI 测试全过。
