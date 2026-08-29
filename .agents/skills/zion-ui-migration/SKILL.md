---
name: zion-ui-migration
description: 迁移 pi-martix-ui-dev 的 UI 块进 deepseek-zion 的强制流程。触发:按 docs/zion-ui-visual-inventory.md 逐块迁移 UI;在 ui-prototype/<组件>/ 生成或迭代迁移 demo;把已确认的 demo 落地到 renderer/src 真组件。
---

# zion-ui-migration — pi-martix-ui-dev → deepseek-zion 迁移 playbook

本 skill 是 UI 迁移流程的**唯一权威**(自 AGENTS.md §8 迁出)。按 `docs/zion-ui-visual-inventory.md` 逐块把 pi-martix-ui-dev 的 UI 迁移进本仓时,**必须**按本流程执行。本流程优先级高于其它任务模板的默认流程(例如 prototype skill 的「多变体对照」不适用于迁移 demo——迁移 demo 只做一份合并形态)。

通用规则仍在 AGENTS.md,用指针不复制:§8 铁律(改样式不删复刻内容;删入口先立 `ui-change-log/` 记录)与风格规范对迁移同样生效。

**术语**:「功能入口」= 用户可达的任何交互点——按钮、菜单项、输入行为(如键入 `/` 触发菜单)、键盘快捷键、点击/hover 区、拖拽热区、弹层触发点、chip/badge/状态条上的可交互元素。

## 强制流程(按序执行,不得跳步)

0. **读三处再动手**:① `docs/zion-ui-visual-inventory.md` 对应节(视觉与实现纪律原文);② 源仓 `D:\pi-martix-ui-dev` 中该节给出的精确定位文件(组件 + 样式段,逐行读);③ `docs/ui-component-inventory.md` 中该块所属目标组件的**完整交互入口列表**。三处未读完,禁止写任何代码或 demo。
1. **对位 + 入口差集(必须书面产出)**:把目标组件的入口清单与源仓块的入口做差集比对,在回复或 demo 顶部注释中显式列出三类:
   - **共有入口**:迁移视觉,保留语义;
   - **缺失入口**(清单有、源块没有):demo 中**必须补齐**(可先以视觉/交互桩呈现,入口不可缺席);
   - **多余入口**(源块有、清单没有):进入第 2 步。
   即使差集为空,也要显式声明「无多余入口 / 无缺失入口」,不得省略本步骤。
1.5. **官方口径核查(书面产出「官方显示什么 / 不显示什么」清单)**:复刻 1:1 的权威口径在官方实现里,不在感觉里——
   - grep `renderer/vendor/` 中对应官方组件的**渲染与过滤条件**(条件渲染、列表过滤、空态处理)。教训:官方 QueueDock 只渲染 `placement==='queued'`(context 项进会话流,dock 不显示);官方无目标时不渲染 goal 条,`hasGoal` 仅做 `/goal` hint 消歧——这两个偏差都是落地后才被用户发现的。
   - 有官方对应物但 vendor 未收的,用 inspector 召唤官方 3080 UI 截基准图(见 `inspector/README.md`),存入第 3 步的 `official/` 目录。
   - 清单写明:官方显示什么、官方**不显示**什么、复刻当前超集/缺集。demo 与落地都以此为对位基准。
2. **多余入口先问后删**:对每个多余入口,逐条询问用户保留还是删除;**得到答复前,禁止生成 demo、禁止改动真组件**。删除范围仅限从 pi-martix-ui-dev 迁移过来的这些组件上的入口;`ui-component-inventory.md` 中列出的任何功能入口**一律不得删除**。
3. **生成合并 demo**:迁移视觉 + 目标组件的全部功能入口(含第 1 步补齐的缺失入口、第 2 步确认保留的多余入口),数据可 mock。**demo 与其验证截图/辅助脚本必须按组件放在 `ui-prototype/<组件名>/` 独立目录中**,不得散放在 `ui-prototype/` 根级。**截图按来源分两类**:官方源 UI 截图(inspector 召唤 / 官方 3080 直接截取,对位基准)放 `ui-prototype/<组件名>/official/`;复刻 demo 的各态验证截图放 `ui-prototype/<组件名>/replica/`;截图脚本(如 `_shot.mjs`)的输出路径必须指向 `replica/`。**用户确认 demo 前,禁止改动 `renderer/src/` 真组件**;确认后的 replica 截图即**形态基准**。
3.5. **落地前决策过堂**:把形态/语义取舍(自研还是 vendor adapter、扩展入口去留、相位/状态编舞、数据接哪条 RPC)列成共识条款,与用户逐条确认并落字。落地中不重新开决策。
4. **落真组件**:demo 确认后,按 AGENTS.md §6 vendor 流程落进真组件。语义零改动红线:vendor 不改、数据契约/交互行为不改,只动结构+视觉。完成判据(全部满足才算落地完成):
   - `npm run build:web` ✓ + `npm run typecheck` 基线零新增(`grep -v vendor` 对照);
   - **探针联动**:先 `grep` 全部 `probe-*.mjs` 中对该组件 class 的断言,**更新腐化断言**(组件结构变了,旧断言不是失败是腐化);再按改动面选探针子集,串行跑,fixture 轨先行、real 轨能跑则跑(3080 常驻勿重启),全绿;
   - **形态比对**:真组件同视口/同状态截图与第 3 步 replica 基准比对,一致或差异可逐条归因(数据驱动,非形态);
   - **残留清理**:被替换的旧入口/旧结构的样式与断言一并清理(死样式三处 grep 零引用才可删:`renderer/src`、`renderer/vendor`、`probe-*.mjs`;注意动态拼接类名如 ``chat-node--${kind}``)。
5. **收尾记账**:删入口/删展示元素先立 `ui-change-log/` 记录(规则见 AGENTS.md §8);提交(推送等用户指示)。**进度打勾(迁移完成的固定动作)**:在 `docs/zion-ui-visual-inventory.md` 对应块标题追加 `✅ 已迁移` + 一行落点(日期 / 落地文件 / demo 路径);在 `docs/ui-component-inventory.md` 对应组件标题追加同款勾(标注 ZION 块号)。这两处勾选是两份清单迁移进度的唯一口径——只勾**本次实际迁移完成**的块/组件,部分迁移不勾;同时回勾 HANDOFF.md。

## 硬性判定(违反即返工)

- 只迁移视觉、未做入口差集比对 = 违规;
- 跳过第 2 步直接删掉/保留多余入口 = 违规;
- 未经 demo 确认直接改真组件 = 违规;
- 未做官方口径核查(第 1.5 步)直接落地 = 违规;
- 落地后探针断言未同步、验证未收口 = 未完成。

**风格默认 = 保持原样**:除非用户明确要求按 `DESIGN.md` 重新设计,迁移块**尽量保持 pi-martix-ui-dev 中原有的风格**逐样搬入,不做风格化改写(此时 AGENTS.md §8 不适用——迁移任务的默认是原样迁移)。

**验证收口**:按改动面选探针,不跑无差别全量;非常规视口/全态截图矩阵(如 720px 矩阵)先问用户再跑;electron 探针一律**串行**(多实例争用 Electron profile 磁盘缓存会假挂起)。

## 陷阱(增量;通用探针技巧见 HANDOFF §5 / AGENTS §4)

- **uSES 订阅叠加**:adapter 与 vendor 组件对同一 zustand store 各挂 `useSyncExternalStore` 会触发渲染死循环(渲染线程内存跑飞);adapter 侧改为挂载读快照 + `useEffect` 手动订阅(实例:`renderer/src/app/model-select.tsx` 的 mi-think)。
- **capturePage 旧帧滞后**:截图与 DOM 断言矛盾时以 DOM 断言为准,或双拍。
- **改动样式先找域文件**:全局样式在 `renderer/src/styles/` 按域拆分,`index.css` 的 @import 顺序不得调换(靠顺序覆盖)。

## 指针(单一事实源,不复制)

- AGENTS.md §8 铁律 + ui-change-log 记账规则、§4 测试策略、§6 vendor 流程;
- `HANDOFF.md` §4 探针全清单、§5 探针技巧;
- `inspector/README.md` — 召唤官方 3080 UI 组件截基准图;
- `docs/zion-ui-visual-inventory.md`(迁移块清单与视觉纪律)、`docs/ui-component-inventory.md`(目标组件入口列表)。
