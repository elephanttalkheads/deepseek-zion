# DeepSeek Zion

为 **DeepSeek Harness(DSH)** 封装的桌面 GUI。自建 React 18 + Vite **复刻 renderer**(1:1 重做 dsh web 的 UI),数据层直接用官方运行时纯类(B 直拼),内嵌**插件运行时底座**承接社区/动态插件的 client 半。

> 路线背景:最初是"Electron 壳直载官方 UI"的原型;后按 `/grilling` 决策改为**自研复刻 renderer**(见 `CONTEXT.md` 与 `renderer/M1-验收记录.md`)。本仓库是**单仓单包**的复刻工程(`renderer/`),主打"功能对等(大致相似)+ 插件可扩展"。

## 一图速览(当前状态 M1–M6 已交付,`main` 最新含交接文档)

| 层 | 是什么 | 位置 |
|---|---|---|
| 数据层 | 官方 client 源码 vendored + Vite 直编,纯类直拼(ConnectionController→SessionManager→Session) | `renderer/vendor/`、`renderer/src/protocol/assemble.ts` |
| 对话层 | 官方 conversation-nodes,挂一个「UI 逻辑面」Context | `renderer/src/app/conversation.ts` |
| UI 层 | 自研 React 组件(三栏/会话/流式/工具卡/审批问卷/队列/模型) | `renderer/src/ui/` |
| 插件底座 | 闭包求值 + guard + 附加型槽 + cordis_run 审批编排 | `renderer/src/plugin/` |
| 真后端联通 | `/api` proxy → `http://127.0.0.1:3080`(剥 Origin 过 trust fence) | `renderer/vite.config.ts` |

## 必读文档(按顺序)

1. **[HANDOFF.md](./HANDOFF.md)** — 交接文档(当前进度 / 后续方向 / 如何开发插件 / 如何更新 / 换机起步 / 探针索引)。新会话或 clone 后**先读它**。
2. **[CONTEXT.md](./CONTEXT.md)** — 领域词表 + 红线 R1–R7(设计口径,含插件运行时与附加型槽)。
3. **[renderer/M1-验收记录.md](./renderer/M1-验收记录.md)** — 每批里程碑的交付/验证/遗留(M1→M6)。
4. **[SYNC.md](./SYNC.md)** — **官方 deepseek harness 更新后如何同步**(耦合面/升级流程/换机链)。

## 快速开始

```sh
npm install          # 首次(file: 依赖指向本机 rc.6 链,换机见 HANDOFF §6)
npx vite build --config renderer/vite.config.ts    # 构建复刻 renderer → renderer/dist
npx tsc --noEmit -p renderer/tsconfig.json         # 自查(过滤 vendor 噪音)
npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort   # 复刻页面
# 打开 http://localhost:5199/?fixture 用假后端;不带 ?fixture 则经 /api proxy 连真 3080
```

真后端验收/视觉对照:

```sh
# 前提:本机 dsh web 已跑在 3080(dsh --profile web --port 3080)
npx electron probe-checklist.mjs      # 24 项功能清单(真后端)
npx electron probe-real.mjs           # 复刻连真后端首屏(只读)
npx electron probe-plugin.mjs         # 插件底座:载入/附加型槽/卸载
# …全部探针见 HANDOFF §7
```

## 结构

```
main.mjs                    Electron 壳(探测/拉起 dsh web/开窗)
renderer/
  ├─ vite.config.ts         build + /api proxy(剥 Origin → 3080)
  ├─ src/
  │  ├─ main.tsx            PluginProvider → RuntimeProvider → AppFrame
  │  ├─ app/                runtime.tsx(hooks/模型/工作区/附件)、conversation.ts
  │  ├─ protocol/assemble.ts  wire 直拼 + host/remote-event 分发
  │  ├─ plugin/             min-ctx / slot-registry / evaluator / guard / runtime /
  │  │                       hub / anchors / remote / run-orchestrator / demo
  │  └─ ui/                 三栏 + 会话 + 对话 + 工具/审批/队列 + PluginHost
  └─ vendor/                官方 client 源码(client-connection/runtime/web-react/ui-slots/ui-conversation)
probe-*.mjs                 无头验收探针(证据归档脚本,产物 gitignore)
HANDOFF.md / CONTEXT.md     交接与词表
```

## 红线(改代码前必看,详见 CONTEXT.md)

- 宿主 dsh 组合零改动;wire 契约零改动(只消费 52 RPC + respond + 双 WS + session.export)。
- 会话语义不变、不伪造遥测;事件订阅完整(`host/remote-event` 等)。
- 动效不拖累主线程。
