# deepseek-zion 与官方 deepseek harness 的同步机制(SYNC)

> 适用:官方 `@deepseek-ai/*` 或 harness 本体更新后,如何把 deepseek-zion 对到新版本。
> 本文件是**机制向导**;现状基线(file: 链 rc.7 + official clone HEAD `dsh-v0.1.1-rc.2`,wire 未变故 vendor 保持 rc.6)见文末「当前基线」。
> 写文件时间:2025-08(M6 后,官方已发 rc.7)。

---

## 0. 一句话

deepseek-zion 对官方的耦合有 **4 个面**,同步时逐面核对:
**① file: ESM 面包 → ② vendored client 源码 → ③ cordis 版本 → ④ wire 契约(信号是否变化)**。
官方发新版 ≠ deepseek-zion 一定要升,先看 ④ 是否破坏契约;没破坏就能先跑旧依赖,坏了才必须升。

---

## 1. 四个耦合面(按风险排序)

### 面 A:file: ESM 面包(低风险,最常触发)
`package.json` `dependencies` 里指向本机当前链(现为 rc.7,见 §5 基线)的普通 ESM 包(共 14 个):
`dsh-agent / dsh-api-remotes / dsh-attachment / dsh-commands / dsh-host-apiproxy / dsh-llm / dsh-llm-retry / dsh-session / dsh-session-projection / dsh-session-title / dsh-tools / dsh-typert-protocol`(+ cordis 是 4.0.1 精确版)。

这些是**客户端纯数据/契约层**。官方升小版本一般只加字段、不改已用面,`npm install` 指向新链即可;若 file: 路径在新机器不存在 → 见 SYNC §4 换机。

### 面 B:vendored client 源码(中高风险,改动最大)
`renderer/vendor/` 下 5 个官方 **client 包源码**(163 文件):
`client-connection / client-runtime / client-web-react / client-ui-slots / client-ui-conversation`。
官方发布是 **ClientModuleSystem bundle**(`window.__ModuleLoader__.load`,不可直 import),所以 deepseek-zion **逐文件拷官方源码**并用 Vite 直编。**官方每次改这些包 → vendor 都要跟着拷最新源码**,否则:
- wire 契约如果变了(新帧/新 RPC)→ 运行期不兼容(见面 D);
- 纯内部重构 → 不升也能跑,但 vendor 会与官方 drift。

### 面 C:类型/编译精度(低风险)
- `@deepseek-ai/cordis` 锁定 `4.0.1`(vendor 的 Service/Fiber/ctx 类型与它不匹配是**既有噪音**,esbuild 剥离不碍事;官方升 cordis 通常不影响).
- `renderer/src/vendor-shims.d.ts` 里的 cordis/use-sync-external-store shim 是本地补丁,一般不用动。

### 面 D:wire 契约(最高红线)
`52 RPC + respond + 双 WS(events.mux/events.host)+ session.export` 是 deepseek-zion 的**消费契约**。判断"该不该升"的核心指标:
- 官方新版本是否**加了新 RPC / 改了 MuxFrame / HostFrame / 加了新 host 事件(如 `host/remote-event` 的 allowlist)**
- 复刻侧 `assemble.ts` 的帧分发与 `remote.ts` 的 RPC 通道是否仍需新方法
若官方只是 UI 内部改、wire 面没动 → **deepseek-zion 可以暂不升**(功能对等不受影响);若 wire 面动了 → 必须同步 vendor(面 B)并补帧分发(面 D)。

### 旁路检查:inspector 的页面启动缝(dev 工具)

官方原版 UI 的组件召唤器需要观察页面模块系统,但不参与 replica 运行时。DSH 0.1.1 起 `window.__ModuleLoader__` 只是注册门面,真实 `ClientModuleSystem` 只由一次性 `create()` 返回;Zion 在 inspector preload 的 document-start 钩子中捕获该返回值。每次升级官方 DSH 都要核对 3080 首页最早的 loader/bootstrap 代码是否仍保持这一时序,并运行 `node probe-inspector-fixture.mjs`;不要把注册门面误当成可 `import()` 的模块系统。

---

## 2. 同步流程(建议顺序)

1. **通读本轮更新**:官方 release notes / git log(`git -C <harness-clone> log --oneline <旧tag>..<新tag>`,按 `packages/` 分区)。
2. **判断是否升级**(先看 wire 面):
   - 只动 UI/内部 → 记录"已知漂移",不升级,断库照跑;**可选**做一次 vendor 对比决定要不要抽空升。
   - 动了 apiproxy / session / client-* / wire → 进入升级流程。
3. **升 file: 面包**(面 A):新机器/新链先 `npm install` 指向新 rc 链;验证 `api-proxy` 契约类型(旧版 API 是否还兼容)。
4. **同步 vendor(面 B)** —— 最花功夫的一步:
   - 从官方源码 clone 对应 tag 拷 5 个 client 包:`cs {harness}/packages/client/...` → `renderer/vendor/<包>`,逐文件覆盖**(保留 deepseek-zion 的本地改动:拷贝前 `git diff` vendor 记录已改处)**。
   - ⚠️ vendor 里可能已有 deepseek-zion 的**本地修正**(例如谁修过某个类型/给 tsconfig exclude),覆盖前先 `git log --oneline -- renderer/vendor` 看历史 patch。
   - 之后 `npx tsc --noEmit -p renderer/tsconfig.json`(过滤 vendor 噪音,看 `src/` 是否新错)+ `npx vite build`。
5. **补帧分发与 RPC(面 D)**:
   - 官方若新增 `host/remote-event` allowlist 事件 → `protocol/assemble.ts` 的 `onRemoteEvent` case 加名。
   - 官方若新增 `dynamicCordisRunner.*` 方法或改签名 → `plugin/remote.ts` 同步。
   - 官方若改 `MuxFrame/HostFrame` union → 看 vendor 后是否还能编译 + 探针是否仍 0 错。
6. **全量拍验**(用探针,见 HANDOFF §7):至少 `probe-checklist`(真后端 24 项)、`probe-plugin`、`probe-real`、`probe-queue`;官方页面 boot/模块包有改动时另跑 `node probe-inspector-fixture.mjs`;有改 vendor 时全部跑。
7. **提交**:提交信息写"sync to dsh <版本>",附面 B 的 vendor diff 概要;推送 main。

---

## 3. 各包升级时重点盯什么

| 官方包 | 影响面 | 升级要验 |
|---|---|---|
| `dsh-host-apiproxy` | wire 契约、RPC 面 | 52 RPC 有无增减、`RpcMethodMap`、新增 `host/remote-event` 事件 |
| `dsh-session` / `dsh-session-title` / `dsh-session-projection` | 会话/标题/投影 | `session.updateQueue`/`QueueAction`、`session.list` 投影字段 |
| `dsh-client-connection` | vendor:连接/帧 schema | `host/remote-event` 帧 shape、`/api` path、403 fence 逻辑 |
| `dsh-client-runtime` | vendor:manager/session/快照 | `snapshot.queue`/`pending` 字段、`handleHostEnvelope` case |
| `dsh-client-ui-conversation` | vendor:节点定义 | conversation-node kinds(12+1)、chat snapshot 结构 |
| `dsh-client-ui-slots` / `dsh-client-web-react` | vendor:槽/绑定 | SlotRegistry 契约、bindSnapshotSelector 签名 |
| `dsh-client-modules` / `dsh-web-frontend` | inspector 页面启动缝 | `__ModuleLoader__.create()` 时序、真实模块系统 `import()`、fixture 召唤探针 |
| `@deepseek-ai/cordis` | 类型噪音 | 一般不动;升了重跑 tsc 模板 |
| `dsh-llm*` / `dsh-tools` | 模型目录/工具视图 | `session.models` shape、`ToolCallView/ToolResultView` |

---

## 4. 换机/新链的特殊情形

- `package.json` 里 file: 全是**机器专属绝对路径**(`C:/Users/zyf/.dsh/profiles/...`)。
  换机器:改成那台机器上对应包的路径,或改成 npm 版本号(line 引用保留在本机即可被 git 忽略了修改)。
- 官方代码 clone(`D:\github-Clone\deepseek-harness`)在本机存在;**不在仓库里**。换机可重新 clone(需要 harness 内部权限)或只依赖 `renderer/vendor`(已拷源码)与文档。
- **别把本地 node_modules 链提交进仓库**;`.gitignore` 已有 `node_modules/`。

---

## 5. 当前基线(2026-08-22 更新:链 0.1.1-rc.2 轻适配后)

| 项 | 值 |
|---|---|
| file: 链版本 | `0.1.1-rc.2`(本机 `C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\*`;npm latest,2026-08-22 升级) |
| 3080 后端 | 已由用户重启为新版本(新 PID;勿再重启) |
| wire 契约(面 D) | **rc.7→0.1.1-rc.2 未破坏**:RPC 仅追加式(gateway 内部重构)、节点 kinds 零 diff、投影键未删改、`host/workspace-added` **被移除**(新增也发 workspace-changed,zion 已删死分支)、HostDescription 新增必填 `home`;`session.export`/`updateQueue`/`dynamicCordisRunner`/credentials/llm 实测全通 |
| 类型面 | 链引入**品牌类型**(GoalId/SessionId/WorkspaceId/RpcId 带 BRAND)+ 投影注册改 stateSchema/wire 分层;zion src/ 已轻适配(8 文件,边界 `as` 转换,接口面保持 string);**src/ 0 错**;新基线 `baseline-errors.txt`(14 vendor 文件,旧基线丢失已重生成) |
| vendor(面 B) | **仍拷自 rc.6/7,漂移扩大**:rc.7→0.1.1-rc.2 共 117 文件 diff;**官方删除 `dsh-client-web-react` 包**(功能并入 client-runtime)→ 下次 vendor 同步是大工程(结构重构),已记录暂缓 |
| 上游 bug | 0.1.1-rc.2 后端 settings 写盘在 Windows **EPERM 自锁**(tmp→rename 失败;外部改名 OK)→ 官方 UI 与 zion 的 settings 写入都受影响,与 zion 无关,待上游修复;backend-only 探针 B1-B3 因此失败 |
| 验收 | probe-checklist 24/24、probe-plugin-settings real 9/9、probe-queue-activation 7/7(新链下实测) |
> 官方源码 clone | `D:\github-Clone\deepseek-harness`,已更新到 `dsh-v0.1.1-rc.2`(2026-08-27 checkout 至 tag,HEAD b150a551b8,与运行时一致) |

> 说明(2026-08-22 轻适配记录):wire 未破坏 → 按 §2 判读不升 vendor;类型面违约已修复(src/ 8 文件 30 处:品牌类型边界转换 + host/workspace-added 死分支移除 + 槽声明对齐 InputZone + model ns 等位声明 + 杂项)。后续官方再更新仍先看 wire。

## 5. 当前基线(写文件时)

| 项 | 值 |
|---|---|
| deepseek-zion `main` 最新 | 见 HANDOFF §1(rc.7 同步批次后) |
| file: 链版本 | `0.1.0-rc.7`(本机 `C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\*`;已按 [UPDATE-DSH.md](./UPDATE-DSH.md) 升级) |
| `@deepseek-ai/cordis` | `4.0.1`(精确,rc.6→rc.7 未变) |
| vendor 的官方包 | client-connection / client-runtime / client-web-react / client-ui-slots / client-ui-conversation(**仍拷自 rc.6**) |
| vendor 相对 rc.7 的漂移 | **无实质 drift**:rc.6→rc.7 内 4 包源码 0 diff,ui-conversation 仅 1 处 Safari textarea 渲染修复(非 wire) |
| wire 契约(面 D) | **rc.6→rc.7 未变**(RPC map / MuxFrame-HostFrame / remote-event allowlist / dynamicCordisRunner / session.export-QueueAction 全部 0 diff) |
| 官方源码 clone | `D:\github-Clone\deepseek-harness`,HEAD = `dsh-v0.1.0-rc.7`(rc.7 写作时快照) |
| 官方已发 | rc.7(deepseek-zion 已升 file: 链;探针 24/24 + probe-real 通过) |

> 说明(2025-08 rc.7 同步记录):本次按 §2 判读 —— wire 面(面 D)未变,故 **vendor 保持 rc.6 源码不升**;仅把 file: 链(面 A)升到 rc.7,`vite build` + `tsc(src/ 0 错)` + `probe-checklist 24/24` + `probe-real` 全部通过。 rc.6→rc.7 期间 apiproxy settings 表面有变化(删 `settings-not-exposed` 错码、namespace 全量暴露),zion 客户端不依赖这些,无影响。下次官方更新仍按 §2 先看 wire。
