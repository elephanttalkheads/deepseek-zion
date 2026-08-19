# 真后端专属项核验报告

- 日期:2026-08-19
- 后端:`dsh web` 3080(PID 10032),`~/.dsh/profiles/web` 组合
- 通道:replica renderer(`vite preview` 5199)经 `/api` 代理直连 3080,官方信封直讲(与 `createWebConnectionRpc` 同构)
- 探针:`probe-backend-only.mjs` → **26/26 PASS**(输出 `probe-backend-only-out/backend-only.json|.txt|.png`)

> 结论速览:六组真后端专属项(settings 写路径 / llm 目录 / credentials / dynamicCordisRunner 插件 run / session.export 下载通道 / session.updateQueue queued 排程)在 3080 上全部真机核验通过;核验过程所有 LLM 调用均落在 **opencode-go / deepseek-v4-flash** —— 用「会话语义配置 + 会话实际模型选择 + 真实回合成功响应」三重证据锁定。

---

## 0. 模型守卫:核验过程始终调用 opencode-go / deepseek-v4-flash

| 项 | 证据 | 结果 |
| --- | --- | --- |
| A1 | `settings.describe` → `agent-default-model` 值 `{"provider":"opencode-go","model":"deepseek-v4-flash","reasoningEffort":"max"}` | ✅ |
| A2 | `llm-pi-ai` 命名空间注册 `opencode-go` 提供方(apiKeyEnv `OPENCODE_GO_API_KEY`) | ✅ |
| A3 | `llm.providers` 一揽子 40 个提供方,`opencode-go(active)`;另 `deepseek-official` / `vision-toolkit-*` 也 active | ✅ |
| A4 | `llm.models` 目录 opencode-go 组 16 个模型,含 `deepseek-v4-flash`、`deepseek-v4-pro` 等 | ✅ |
| A5 | `session.create` 新建会话成功 | ✅ |
| A6 | `session.models` → 会话实际模型选择 `{"provider":"opencode-go","model":"deepseek-v4-flash","reasoningEffort":"max"}`,`routable:true` —— 这就是该会话回合真正会被调用的模型 | ✅ |

补充:核验 G 时该会话真实跑完两轮 LLM 回合(历史事件含 `assistant/message` + `step/end` + `turn/end`),**未出现 400** —— 证明在 opencode-go/deepseek-v4-flash 下普通回合请求正常完成。

## 1. settings 写路径(update / replace / mutate)

对 `vision-toolkit` 命名空间做同值 no-op 写回(不动真实配置):

- `settings.mutate` `{op:'set', path:['provider','baseUrl']}` → ok,revision 更新
- `settings.update` 同值 patch 合并 → ok
- `settings.replace` 整段写回(与 redacted `user` 层逐字段一致)→ ok
- 写回后 `settings.describe` 复核:值与写前完全一致(**零副作用**)

## 2. credentials(describe / set / unset)

- `credentials.describe(['OPENCODE_GO_API_KEY','DEEPSEEK_API_KEY','ZION_PROBE_SCRATCH'])` → 真实引用 `configured:true, source:'file', writable:true`,从未写入值;`ZION_PROBE_SCRATCH` 初始 `configured:false`
- 临时引用 `credentials.set('ZION_PROBE_SCRATCH', …)` → describe 确认 `configured:true`
- `credentials.unset('ZION_PROBE_SCRATCH')` → describe 确认 `configured:false`(**已完全恢复**)
- 全程值只在 set 方向过线,响应的 CredentialView 无值槽 —— 与官方契约一致

## 3. llm 目录(providers / models / discoverModels)

- `llm.providers` → 40 个可配置提供方视图(active/idle、settingsNs、声明来源)
- `llm.models` → 4 个组(DeepSeek:2、opencode-go:16、Vision Toolkit 2+8),`failures:[]` 全部加载成功
- `llm.discoverModels({settingsNs:'llm-pi-ai', provider:'opencode-go'})` → 注册表路径应答(不发网络),返回候选模型带 contextWindow/maxTokens

## 4. dynamicCordisRunner 插件 run 通道

- `dynamicCordisRunner/inventory` → `ok:true, value:[]`(当前 0 个动态插件运行)
- `dynamicCordisRunner/runHostHalf`(不存在 agent)→ 规范业务错误 `session-not-found`,非传输层 404 —— 通道已在真后端注册并可答
- 注意:remote 载荷须为纯对象 `args:{...}`(wire 字段按参数名:`agentId/pluginId/packageId/mode/requestId/approveFutureVersions`);传数组会得到 `internal: Remote payload must contain exactly one plain-object args field`

## 5. session.export 下载通道(GET)

- `GET /api/session.export?sessionId=<新会话>` → `200 application/zip`,`Content-Disposition: attachment; filename="dsh-session-….zip"`,首字节 `PK`,约 380B(空历史 ZIP)
- 缺 `sessionId` → `400 missing or invalid sessionId`
- 未知 session → `404`
- 该通道为宿主直答 GET(无信封);浏览器 `IApiClient` 本不分发它,下载走浏览器原生下载

## 6. session.updateQueue 真后端 queued 排程

- 机制确认:`session/queue` 快照经 mux **WebSocket** 推送(真后端对 SSE GET 回 `426 Upgrade Required`,官方客户端也是 WS)
- 实测队列生命周期:回合运行中 send 的前台消息立即被认领(`agent/inbox/spliced`),切到 queue 模式的第二条消息先以 `queued` 发布,随后回合收尾时被 splice/认领 —— **pending 窗口可能只有毫秒级**
- 探针在帧到达的同刻就地发 `session.updateQueue remove`:命中真实挂起项 → `{"ok":true,"value":{"accepted":true}}`,随后快照不再含该项;对已被认领的项请求会得到精确业务错误 `queue-item-not-found`(说明调用确实到达宿主并按状态正确求值)
- 与 8/18 的 `probe-queue-ops`(UI 侧 queued 行 + 插队成功)互为印证:回合足够长时队列项可操作

## 7. UI 稳定性

- 全过程零控制台错误;侧栏会话行 + 输入栏存活(replica 与真后端对话面无异常)

---

## 附:关于「本轮运行失败 400 (tool_count_limit)」的归因

用户在 GUI 中遇到的:

```json
{"param":"tools","type":"invalid_request_error","message":"Error from provider (Console Go): Upstream request failed: [unsupported_tool_schema] The tool schema is not supported (tool_count_limit)."}
```

- `(Console Go)` 是 pi-ai 上游网关对该 LLM 通道(即 opencode-go 提供方)的展示名 —— **调用的正是 opencode-go,并非别的模型**
- 400 原因:请求携带的**工具 schema 数量超过上游该模型的上限**(`tool_count_limit`),上游在 `tools` 参数上直接拒绝 —— 组合型 agent 回合(工具全量 + MCP/插件工具)容易触顶;纯文本回合(如本核验 G 的回合)不触发
- 与本仓库/复刻无关,属上游通道的请求级限制;应对方向:收窄回合工具集(关闭多余 MCP/插件/工具呈现),或换用工具数上限更高的通道
- 本次核验含真实 LLM 回合,均成功未触发 400,佐证上述判断