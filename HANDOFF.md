# DeepSeek Zion 交接文档(Handoff)

> 交接时间:2026-08·会话后半(UI 功能入口差距补齐轮)。交接人:deepseek-v4-flash on DSH。接任对象:**本机新会话**(继续「补差距」)或 clone 本仓库的任意 agent。
> 本文件是接任**首要必读**入口;重复内容一律指向既有文件:`SYNC.md`(官方更新同步)、`CONTEXT.md`(领域词表/红线)、`docs/ui-entry-gap-inventory.md`(UI 入口差距执行索引)、`docs/real-backend-only-verification.md`(真后端专属项核验 + 400 归因)、`renderer/M1-验收记录.md`。

---

## 0. 一句话项目定位与当前状态

`deepseek-zion` = DeepSeek Harness(DSH)的桌面 GUI:**自建 React 18 + Vite 复刻 renderer,数据层直接用官方纯类(B 直拼),插件底座承接 community 插件**;零 cordis 装配,`/api` proxy 直连真后端(3080)。

**当前阶段(本会话主线)**:功能接线收尾(已完成)→ **真后端专属项核验(26/26)** → **UI 功能入口差距补齐(进行中)**。目标:`官方 UI 可点的入口在 replica 中全部存在且可用`,每项以官方 3080 为基准、探针验证、真后端可操作。

**进行中的 goal(round 8/30,跨机交接后继续)**`:goal-284dc56d`(max 30 轮)。objective:①②③④⑤ 五类差距补齐(见 §3)。已完成的核验/补齐:
- **右栏 SubagentPanel 删除(对齐官方右栏)** ✅ 2026-08-29,用户裁决:删除 zion 附加的右栏子代理面板(列表+刷新/投递/中断),对齐官方(官方右栏=工具详情,无子代理面板;官方子代理语义=会话头目录树+只读 composer+层级面包屑,全部保留);ui-change-log 已立账;删 `ui/SubagentPanel.tsx`(117 行)+ DetailsPanel 挂载 + `.subagent-panel*` 样式 + runtime `subagentActions` 封装(wire/api 零改动);probe-functional 16/17 改反向断言;probe-subagent 7/7×2、checklist 24/24 回归
- ① TrajectoryView ✅ real 6/6 + fixture 10/10
- ② 设置界面(壳+通用+Provider 编辑)✅ real 11/11 + 10/10
- ③ dynamicCordisRunner 运行编排 UI ✅ real 7/7
- P1 模型两级菜单 ✅ real + fixture 7/7
- P1 **权限三面 + Plan chip** ✅ fixture 12/12 + real 12/12(本轮)
- P1 **信息层三件套(ContextMeter / StatsLine / TodoDock)** ✅ fixture 6/6 + real 7/7(本轮)
- P2 **会话行 … 菜单 + 视图选项菜单** ✅ fixture 8/8 + real 8/8(本轮)
- P2 **拖拽重排 + 溢出展开** ✅ fixture 6/6 + real 6/6(本轮)→ **P2 全清**
- P3 **QueueDock 行内编辑 + 运行中排队发送** ✅ 3/3(本轮;InputBar 运行中同时显示 停止+发送,补上官方 composer 队列姿态缺口)
- P0 **JobListAction 作业 badge** ✅ probe-jobs fixture 9/9 + real 10/10(本轮;见 §3A 已执行)
- P0 **消息时间戳收尾(MessageIconActions)** ✅ probe-msg-actions fixture 8/8 + real 8/8(本轮;vendor 激活 MessageIconActions:复制/分支图标 + hover 时间戳 + user 行 clock=start;forkSession 补 select 重试)
- P1 **附件 Lightbox / 拖放覆盖层(ui-attachment)** ✅ probe-attachment fixture 8/8 + real 8/8(本轮;消息图片 ImageGallery/MessageImage → Lightbox,loader=session.readAttachment;InputBar AttachmentRail + document 拖放 + DropOverlay)
- P1 **ProducedFiles 产物行(ui-deliverables)+ WorkflowRun 面板(ui-workflow-run)** ✅ probe-deliverables fixture 6/6 + real 6/6(本轮;deliverablesDefinition 累积(tool locations 派生)+ turn-tail 产物行(host.openPath);workflowRunDefinition + WorkflowRunPanel(DisclosureRow 补 vendor);fixture 补 locations 与 tool-workflow 事件族)
- P1 **SkillRow 专用工具卡(ui-skill)** ✅ probe-skill fixture 5/5 + real 5/5(本轮;vendor SkillRow(toolview 本地化)+ ChatView skill 分支;`/` 触发源随 ⑥ MenuView 一并接入)
- P2 **`/` 触发菜单 MenuView + popupSelect(ui-input-trigger + ui-commands)** ✅ probe-trigger fixture 9/9 + real 9/9(本轮;vendor input-trigger 核心/controller/MenuView + commands popup 壳;zion 管线:command/skill 双源 + /permission popupSelect 装饰(Full access 风险确认)+ actx shim + track 去重;InputBar 键入触发/仲裁/锚点)
- P3 **ApprovalPanel composer 接管 + QuestionComposer/PlanReview 区分(ui-conversation skeleton + ui-user-questions)** ✅ probe-takeover fixture 8/8 + real 8/8(本轮;vendor ui-user-questions 整包;激活 vendored ApprovalPanel;tsconfig paths 把 `@deepseek-ai/dsh-client-ui-conversation/client` 解析到 vendored chat-nodes.ts → 官方 ChatNodeDataMap 增强真实 merge(9 个基线错误文件清零);ComposerSeat 链选举(approval>question>InputBar);**移除 M3 InteractionDock 独立卡**(官方语义:挂起交互接管 composer,聊天流不重复渲染);fixture 常驻审批配对在飞 bash 调用(turn 78)+ 稳定 question rpcId;探针缝 rpcId 显式化;回归全绿:trigger/skill/msg-actions/checklist/jobs/deliverables/attachment/m3/queue-edit)
- P3 **Agent 预设四表面(ui-agent-preset)** ✅ probe-preset fixture 10/10 + real 9/9(本轮;vendor ui-agent-preset 整包(4 组件+3 控制器+PresetMenu);zion 适配三控制器装配 + 四座位(hero chip/会话头标签/通用区行/设置分区);manager 快照补 ids/byId 等位(官方 SessionListState 面);ui-settings 等位 SlotMap;fixture settings.update 补 agent-presets ns;深绿调色板补缺令牌并修正上一轮浅色误值;probe-preset:hero 暂存→新建会话自动应用→会话头标签;通用区行往返;分区复制/查看/删除/设默认全链路;real 真实 roster 渲染)
- P3 **Miller 目录浏览弹窗(ui-directory-picker-browse)** ✅ probe-directory fixture 9/9 + real 9/9(本轮;vendor DirectoryBrowser 纯组件(Translate 改从 ui-slots 导入)+ zion 适配(host.listDirectory/createDirectory → workspace.create,失败留窗)+ WorkspaceMenu 新建工作区改开应用内弹窗(原生 picker 退役);probe-directory:主目录单栏(隐藏项默认不可见)→ 双栏 → 推进 → 新建文件夹 → 路径编辑 → 显示隐藏 → 打开创建;real:3080 未装配 browse 能力 → 官方同款诚实报错面)
- P3 **子代理目录树 + 只读 composer(ui-subagent)** ✅ probe-subagent fixture 6/6 + real 6/6(本轮;vendor ui-subagent(目录树 + 只读 composer)+ ts-types dsh-subagent 占位(subagentTiming 投影)+ 会话头目录树座位(展开/打开子级/openChild=selectSession)+ ComposerSeat 链只读分支(官方 priority -10:one-shot/父离线未运行,approval>question>只读>InputBar)+ fixture 目录样本(Beta 可继续→Gamma 一次性);probe-subagent:计数徽标 → 树行 → 展开 → 打开 Gamma → 只读 composer 无输入条 → 回选父会话恢复;real 无子代理隐藏动作(官方同款))
- P3 **cordis 插件面板增强** ✅ probe-cordis-panel fixture 6/6 + real 6/6(本轮;remote 补 stopFromPanel/undefineFromPanel(3080 已实装)+ hub stopRow/removeRow/setRpc(wire rpc 注入)+ PluginHost 行增强:版本选择器/运行(run|update)/停止/移除/重试下一版本/回滚 + fixture 内存清单端点全链(inventory/runHostHalf/stop/undefine/getClientCode/resolveRequestRun);real:清单读取 + 面板端点对不存在插件确定性业务拒绝)
- ⑤(部分) 消息复制/分支 ✅ real 6/6
- ④ 会话导出按钮 → **已核定为 N/A**(官方 web 客户端无该按钮,`downloads` 是 host-only 通道;见 §3)
- **归档过滤修复(bugfix)** ✅ 归档的会话从侧边栏消失(官方 ui-workspace 语义;真实后端只发 host/archived-sessions-changed、zion 此前未过滤 → 归档后行不消失 + 官方 3080 隐藏的那批会话全显示);probe-archive-filter real 4/4 + fixture 4/4,workspace-actions fixture 回归 8/8
- **插件设置分区(对齐官方 ui-settings-plugins)** ✅ 移除多余「插件清单」导航项;「插件」页 = 两 tab(插件配置:终端/Agent 循环/网页搜索三卡可编辑(settings.mutate+revision 栅栏,网页搜索 API key 走 credentials.set);插件列表:pluginInventory/list 只读清单,grilling 共识三组 官方/MCP/社区,社区行徽标+UI 注入未实现说明,组头计数+搜索+状态点+展开);fixture 补三 ns + pluginInventory 端点;probe-plugin-settings fixture 8/8 + real 8/8;settings 回归 fixture 11/11;CONTEXT 补「插件类别」词条- **插件计数会波动(已知现象,非 bug)**:pluginInventory 的 `include:agent-presets:*` 组是「当前生效预设展开的 Loader 条目」,随 agentPresets.select 切换/懒加载变化(如 27→6 条,总数 168→147);其它组(官方 include 137 + 非 include 4)恒定。用户看到计数变化时先看 agent-presets 组,别误判为插件丢失。2026-08-20 核验:dsh-agent-presets 8/19 被重写过(同版本 rc.7),3080 9:55 启动,与 zion 代码修改无关。
- **组件召唤器 inspector(官方原版 UI 内呼出真实组件)** ✅ `npm run start:inspector[:fixture]`:官方 3080 页面注入悬浮面板(右下角「⿻ 组件」)+ 控制口 5198 + `node inspector/cli.mjs`。DSH 0.1.1 不再发布旧 `window.__DSH_MODULES__`;inspector preload 在 document-start 包装注册门面 `__ModuleLoader__.create()`,捕获其返回的真实 `ClientModuleSystem` 为 `__ZION_INSPECTOR_MODULES__`,再动态 import 官方 client 模块(React 同实例挂载,舞台 overlay)。捕获失败不再阻断整面板/真实配方。fixture 的「内测声明」因缺 `ui-onboarding` 设置命名空间无法持久化,仅在 fixture 点「继续」后清完整 modal+mask 并恢复 `#root` inert;真实模式不绕过。回归:`node probe-inspector-fixture.mjs` 8/8(入口/模块/配方/GoalBar 舞台/声明关闭与点击可达/整页刷新重捕获),使用隔离控制口且不拉起或重启 3080。其它能力:真实配方驱动官方 UI 状态、raw/eval/shot/close、单实例接管、端口退避、热重载、截图亮度自检、manifest states/`core.ensureExpanded`;页面刷新自动重新捕获并注入。
- **输入栏合并形态落地(ui-prototype/input-bar demo → 复刻真组件)** ✅ 2026-08-21:自研 Matrix TodoDock 替换 vendor 席位、GoalBar 三态编舞重设计、QueueDock 挪进 `.input-bar-dock` 停靠排(TodoDock→GoalBar→QueueDock→SlotAnchor)、ContextMeter 环移除 + StatsLine 移至输入框底部(两条 ui-change-log 立账);语义零改动(vendor/数据契约/goal 动作/队列行为不动);probe-composer-stats fixture 5/5 + real 6/6、probe-functional fixture 22/22(新增 goal 三态断言)、functional-queue 10/10、queue-edit 4/4、queue/queue-ops real 过、checklist 24/24、typecheck 0 新增错误文件。
- **ZION 氛围层三块落地(块 1 数字雨 + 块 2 CRT 扫描线 + 块 16 字体字形)** ✅ 2026-08-23:`ui/RainCanvas.tsx`(算法数值逐字:FS=18/拖尾 0.035/90·fx.speed 节流/12% 亮头/GLYPH_SX 0.55/REDUCED 静态帧)+ `app/ambient-fx.ts`(模块级 fx 两档 {1,0.3}/{2.2,0.85},AppFrame 订阅选中会话 running 手动驱动,不进 React 渲染路径;只读探针缝 `__zionAmbientFx`)+ `styles/ambient.css`(#rain z-index -1 / .scanlines z-40 pointer-events:none)+ 三字体入 `renderer/src/assets/fonts/` + `@font-face` 与 `matrixGlyphs.ts`(MATRIX_CHARS 单一事实源)+ body 全局字体切 `--m-font` 链;全 UI 表面令牌统一 alpha 0.92 半透明(`--bg-panel/--bg-raised/--dsw-alias-bg-layer-2/-bg-module-platform/--dsw-specific-menu`),遮罩 0.6,雨幕透全屏。验证:新 probe-ambient fixture 14/14(挂载/z-index/三字体/半透明/fx 两档往返/动画活)、probe-functional fixture 21/21 回归、typecheck 基线零新增;demo 与五态截图 `ui-prototype/ambient/`。
- **ZION 会话区六块落地(块 6 消息流+注入解码 / 块 7 思考块[磁带纹横置重设计] / 块 8 继电器工具卡 / 块 9 diff 烧录审计 / 块 11 凝结雨轨 / 块 12 字形蛾+中断锁定;块 18 横切随落;块 15 状态栏决策不落地)** ✅ 2026-08-27:新增 `ui/TurnRail.tsx`(26px 双列迷你雨,节流 90/fx.speed 只读 ambient-fx)、`ui/ThinkBlock.tsx`(`<details>` 默认折叠 + C 磁带纹横置:竖划 1.4×(3~8)px/2.2px·60ms 向右/6% 高亮簇/destination-out 0.10;EEG 脑波褶按用户裁决被替换)、`ui/chat-fx.tsx`(InjectDecode 常开 min(700,240+len*6)ms / MothCaret 120ms+1.1s / AbortedMark 450ms 源仓文案「 [已被操作员中断]」);`ChatView.tsx` 重写(user 节点 OPERATOR 头+右对齐+注入解码;非 user 节点按回合分组 `.turn-agent[ is-active][ historical]` 纯加法包裹挂雨轨;reasoning→ThinkBlock 补折叠入口;流式末块挂光标、interrupted 末块挂中断标[复刻此前双缺失]);`ConversationDock.tsx` 传 streaming;`ToolCallCard.tsx` 外壳 `.trace.track>.unit.{run|ok|err}`(coil/clack 逐字、DIN 导轨 34px 纹理、.dur 无真实耗时显 `—` R4),ToolBody 全分支保留;diff 卡数值审计对齐(BURN_CAP=30/0.09s 阶梯/ring+0.9 基准/无蠕虫门控直接渲染);tokens.css 横切(6px 绿胶囊滚动条/绿选区/focus-visible)、ambient.css 末位 reduced-motion 全套压平+终态补偿。多余入口用户裁决全删:日志抽屉+按钮/SND/DEC/TLS/uptime(块 15 决策记录于 visual 清单,不打勾)。验证:新 probe-conversation fixture 19/19 + real 19/19、msg-actions 8/8×2、checklist 24/24、functional 21/21、ambient 全 PASS、typecheck 基线零新增;probe-checklist/real 腐化断言同步(.tool-card→.trace.track);demo 与三态截图 `ui-prototype/conversation/`;两份清单打勾(visual 块 6/7/8/9/11/12/18 + inventory A4/A10)。
- **composer 区按 demo 形态重构(第二轮,微簇单行 + 输入行单行合并)** ✅ 2026-08-21:`.input-bar-modes` 重构为 demo .micro 单行(左:权限/plan chip 压缩为 ghost chip;右 cluster:模型名紧凑触发[菜单功能保留,effort 段 CSS 隐藏]+ 独立 mi-think[data-level 等级色,手动订阅 directory store——useSyncExternalStore 与 vendor ModelSelect 同店订阅叠加在 fx-alpha 下触发渲染线程跑飞(3GB+ 内存,dbg3 二分定位),改 useState+useEffect 等价订阅]+ ContextCapsule[ctx 胶囊条+百分比,数据=已删 ContextMeter 环同一 contextPressure/contextOccupancy 桥,环不复活]+ mi-state[READY 磷光绿/非 READY 琥珀]);`.input-box`/`.input-row` 单行合并(上下发丝边框壳、附件缩略图壳内顶部、+ 📎 ❯ textarea ✕/↑ 同行、textarea 按 scrollHeight 撑高 5 行封顶);GoalBar 未设定态改简洁形态(靶标+「未设定目标」+＋ 设定目标);`.input-bar-foot` 废除(功能并入 input-row)。探针:composer-stats 加 C3b 微簇断言(fixture 6/6 + real 7/7)、model 加 M6b mi-think 断言(real 8/8)、permission-plan 12/12×2、attachment 8/8×2、trigger 9/9×2、functional 22/22、checklist 24/24、probe-m3 停止/发送改按 class 点击(其 .input-bar-model-select 断言为两级菜单落地前的既有腐化,未修);形态比对截图 probe-composer-stats-out/composer-form-fixture.png 对 demo idle/running 形态一致。
- **ASCII 会话城侧栏落地(块 4 替代设计,zion-ui-migration 全流程)** ✅ 2026-08-28:源 = pi-martix-ui-dev `docs/ascii-cyberpunk-sidebar-design.md` + `ui-demo/ascii-cyberpunk-sidebar-prototype.html`(培育仓/全息层设计未搬入,用户指定 ASCII 原型替代);新增 `ui/sidebar-city/`(city-engine 字形白名单/建筑点云/投影/雨 LUT/二态 CITY_STATUS、useWorkspaceCityModel[可见性官方口径 origin!=='subagent'+非归档+blank 仅当前、fork 子代嵌套 children、未分组灰 District]、useCityCamera[W/S/A/D+滚轮+空白拖拽,reduced 跟随系统]、CityFrame[canvas 五层绘制+投影 DOM 每帧直写]、CityIndex[vendor Menu ⋯/caret/拖拽 insertSessionBefore/+N 折叠/LOCATE])、`Sidebar.tsx` 整体重写(品牌头+工具条:搜索/视图选项/新建/⌂添加工作区[新增入口已立账 ui-change-log]/⚙+footer SlotAnchor+width-handle 280–420 写 `--sidebar-width`)、`styles/sidebar.css` 全量重写;语义零改动(状态色只 running→STREAMING/READY 二态不伪造;索引点会话只选中不跳相机,LOCATE 才跳)。验证:build ✓ + typecheck 基线零新增;探针双轨 checklist 24、workspace-actions 8、sidebar-drag 7、archive-filter 4、composer-stats 6、permission-plan 12、conversation 19、msg-actions 14、ambient 14(8 个探针腐化断言随结构重写);形态比对 7 态截图(`ui-prototype/sidebar/replica/sidebar-real--*.png`,real 3080 数据)对 demo 基准一致、差异逐条可归因数据;两份清单打勾(visual 块 4 + inventory A2);demo/截图/决策过堂 `ui-prototype/sidebar/`。

---

## 1. 最近提交链(自本会话;`main` 最新行在前)

| 提交 | 内容 |
| `(本轮,见 git log)` | **右栏 SubagentPanel 删除(对齐官方右栏)**:用户裁决删除 zion 附加的右栏子代理面板(官方右栏=工具详情,无子代理面板;官方替代=目录树+只读 composer+层级面包屑,均保留);删 `ui/SubagentPanel.tsx` + DetailsPanel 挂载(留占位+`settings.plugin.item` 槽)+ `.subagent-panel*` 样式 + runtime `subagentActions` 封装(wire/api 契约零改动);probe-functional 16/17 改反向断言(右栏无面板+占位仍在);文档同步(ui-component-inventory A5/A9/树/密度表/RPC 表、ui-entry-gap、HANDOFF);ui-change-log 先行立账 |
| `f9b4e50` | docs(ui-change-log): 记 SubagentPanel 删除(对齐官方右栏,先记账) |
| `8b6e1de` | **ASCII 会话城侧栏落地(zion-ui-migration 全流程)**:新增 `ui/sidebar-city/`(city-engine/useWorkspaceCityModel/useCityCamera/CityFrame/CityIndex)+ `Sidebar.tsx` 整体重写 + `styles/sidebar.css` 全量重写(layout.css app-grid 列改 `var(--sidebar-width, 280px)`);19 文件 +2570/-566;8 个探针腐化断言按新结构重写(probe-conversation A9 改 turn-tail 口径等);ui-change-log 记「添加工作区」新增入口;验证:build ✓ + typecheck 基线零新增 + 双轨探针全绿(checklist 24/workspace-actions 8/sidebar-drag 7/archive-filter 4/composer-stats 6/permission-plan 12/conversation 19/msg-actions 14/ambient 14) |
| `b995d2a` | demo(sidebar):删 map-stylebar、索引选会话不跳相机、map-body 底部新增 LOCATE 按钮(用户裁决) |
| `5dd7c7f` | demo(sidebar):ASCII 会话城侧栏迁移合并 demo(zion-ui-migration 第 3 步;`ui-prototype/sidebar/`) |
| `(本轮,未提交)` | **ZION 会话区六块落地(块 6/7/8/9/11/12 + 块 18 横切;块 15 决策不落地)**:新增 `ui/TurnRail.tsx`(凝结雨轨,90/fx.speed 只读 ambient-fx)、`ui/ThinkBlock.tsx`(details 折叠 + 磁带纹横置替换脑波褶,用户裁决)、`ui/chat-fx.tsx`(InjectDecode/MothCaret/AbortedMark);`ChatView.tsx` 重写(OPERATOR 头+注入解码、回合分组 .turn-agent、思考折叠与中断标记补齐复刻双缺失);`ToolCallCard.tsx` 继电器外壳(.trace.track/.unit/.contact/.dur,R4 无耗时显 —);diff 卡数值审计(BURN_CAP=30/0.09 阶梯/ring+0.9);tokens.css 滚动条+选区+focus-visible、ambient.css reduced-motion 全套;新 probe-conversation 19/19×2、msg-actions 8/8×2、checklist 24/24、functional 21/21、ambient PASS、typecheck 零新增;两份清单打勾(visual 6/7/8/9/11/12/18 + inventory A4/A10),块 15 记录不落地决策 |
| `(本轮,未提交)` | **ZION 氛围层三块落地(块 1 数字雨 + 块 2 CRT 扫描线 + 块 16 字体字形)**:新增 `ui/RainCanvas.tsx`(源仓算法数值逐字)、`app/ambient-fx.ts`(模块级 fx 两档,AppFrame 订阅选中会话 running 手动驱动;只读探针缝 `__zionAmbientFx`)、`styles/ambient.css`(#rain z-1 / .scanlines z-40 pointer-events:none);三字体入 `renderer/src/assets/fonts/` + tokens.css 顶部 `@font-face` ×3 + body 切 `--m-font` 链;`matrixGlyphs.ts` 拷入作 MATRIX_CHARS 单一事实源;全 UI 表面令牌统一 alpha 0.92 半透明(雨幕透全屏,用户确认的 demo 决策)、遮罩 0.6;新 probe-ambient fixture 14/14 + functional fixture 21/21 回归 + typecheck 基线零新增;demo/截图 `ui-prototype/ambient/`;两份清单打勾(visual 块 1/2/16 + inventory A1) |
| `(本轮,未提交)` | **composer 区按 demo 形态重构(第二轮)**:`.input-bar-modes` → demo .micro 单行(chip 压缩 + 右 cluster:模型紧凑触发/mi-think/ContextCapsule/mi-state);`.input-box`+`.input-row` 单行合并(+ 📎 ❯ textarea ✕↑ 同行、附件壳内顶部、textarea 撑高 5 行封顶);GoalBar 未设定态简洁化;`.input-bar-foot` 废除;model-select adapter mi-think 手动订阅(uSES 叠加跑飞的规避);composer-stats ContextCapsule(contextPressure 数据复活、环不复活);探针 C3b/M6b 新断言,composer-stats 6/6+7/7、model 8/8、permission-plan/attachment/trigger 双轨全过、checklist 24/24 |
| `(本轮,未提交)` | **输入栏合并形态落地(demo → 真组件)**:新建自研 `ui/TodoDock.tsx`(Matrix 版 plan strip,结构 1:1 对官方 TodoPanel:整头 button[aria-expanded] + 「任务」+ 计数汇总 + chevron 展开收起 + ✓◐○ 字形,vendor 零改动);`ui/GoalBar.tsx` 重设计(靶标 SVG 双环+核心 / 相位标签「进行中的目标·已暂停的目标·受阻的目标」/ 三态编舞 active 磷光绿旋转·paused 琥珀·blocked 橙红 glitch / 图标动作组 data-action=pause·resume·edit·complete·clear;受阻相无 pause/resume 钮对齐官方);QueueDock 从 ConversationDock 挪进 InputBar 的 `.input-bar-dock` 停靠排(TodoDock → GoalBar → QueueDock → SlotAnchor);ContextMeter 环按评审裁决移除(ui-change-log 两条立账:context-meter 环 + goal blocked 钮);StatsLine 移至输入框底部 Matrix 化;runtime 加 `__zionProbeGetSelectedSessionId` 探针缝(fixture);styles.css 追加 dock 排条语言(暗底+CRT 扫描纹+能量竖轨+状态辉光);探针:composer-stats 改写(fixture 5/5 + real 6/6)、functional goal 段改 data-action + blocked 注入断言(fixture 22/22)、functional-queue 10/10、queue-edit 4/4、queue/queue-ops real 过(queue-ops 首个 prompt 改长任务修时序抖动)、checklist 24/24;typecheck 基线对照 0 新增错误文件(git archive HEAD 重建基线)|
| `(本轮)` | **会话层级面包屑(官方返回主会话入口)+ SubagentPanel 存废裁定**:grill Q1-Q6 全 A;事实探子确认:官方右栏无子代理面板(详情栏=工具详情,ui-subagent 只有目录树+只读 composer),官方返回主会话 = 会话头「会话层级」breadcrumb(deriveAncestry 沿 parentId 上溯,点祖先段 sessions.open);实现:ConversationDock 会话头手写 nav.conversation-header-crumbs(aria-label 会话层级,当前段只读,点祖先段 selectSession(父));vendored fixture 补 lineage(origin/parentSessionId,真宿主同款,探针补丁注释);文档:ui-component-inventory A3③/A5 注/§3 索引行、CONTEXT「会话层级」词条、ui-entry-gap P4 闭环行;probe-subagent fixture 7/7 + real 7/7(新增 S4b 面包屑祖先链 + S5 面包屑点主会话段回父);SubagentPanel 保留(zion-add,official 无右栏子代理面板,官方替代=目录树+只读+层级);checklist 24/24 回归 |
| `(本轮)` | **sync to dsh 0.1.1-rc.2(轻适配)**:机器链已升 0.1.1-rc.2 且 3080 已重启;wire 未破坏(24/24 + plugin-settings 9/9 + queue 7/7),vendor 不升(117 文件漂移 + 官方删除 web-react 包,记录暂缓);类型面适配 src/ 8 文件 30 处(品牌类型 GoalId/SessionId/WorkspaceId/RpcId 边界转换、host/workspace-added 死分支移除[新链已删该事件]、HostDescription.home 必填、composer-stats 槽声明对齐 InputZone、model ns 等位声明、SettingsShell ref 收窄、hub remote! 断言、vite proxy 类型);重建丢失的 baseline-errors.txt(14 vendor 文件);SYNC.md 基线更新;上游 bug 记录:0.1.1-rc.2 settings 写盘 Windows EPERM 自锁(待官方修) |
| `(本轮,未提交)` | **inspector 适配 DSH 0.1.1-rc.2**:preload document-start 捕获 `__ModuleLoader__.create()` 返回的真实模块系统;main 不再等已移除的 `__DSH_MODULES__`,捕获失败仍注入面板;fixture 欢迎声明清完整阻塞层并恢复 `#root` inert;页面刷新重注入且控制口启动串行化;新增 `probe-inspector-fixture.mjs` 8/8(含遮罩点击可达+reload 重捕获),queue activation 探针同步新捕获缝;README/SYNC/UI inventory 更新。 |
| `(历史)` | 组件召唤器 inspector 初版:main.mjs 加 --inspector/--fixture/--hidden(官方原版 UI 注入召唤面板 + 127.0.0.1:5198 控制口 + capturePage 区域截图);page-panel + recipes + cli + manifest 生成;当时依赖旧版页面公开的 `window.__DSH_MODULES__`,现已由上一行的新捕获缝替代。 |
| `(本轮)` | 插件设置分区:SettingsShell 移除「插件清单」导航项(官方无独立导航项);新增 PluginsSettingsSection(插件配置三卡 + 插件列表三组 官方/MCP/社区,社区徽标+UI 注入未实现说明);fixture 补 shell/agent-loop/web-search-deepseek ns + mutate + pluginInventory/list 端点;probe-plugin-settings fixture 8/8 + real 8/8;probe-settings S3 断言更新(导航无插件清单);ui-component-inventory/CONTEXT/HANDOFF 同步
| `bf486e1` | 归档过滤修复:runtime 捕获 workspace.list 的 archivedSessionIds(此前被丢弃)+ onHost 消费 host/archived-sessions-changed + 选中会话被归档后清空选择;Sidebar rows 排除已归档会话(flat + 分组同源,官方 deriveFlat/sessionVisible 语义)+ 行 data-session-id;新 probe-archive-filter(真后端 8 个已归档不进侧边栏/归档行消失/清空回归/入口保留 4-4);typecheck 基线 172 行不新增;gitignore 补 probe-archive-filter-out/
| `(本轮,见 git log)` | cordis 插件面板增强 ⑪:remote 补 stopFromPanel/undefineFromPanel + hub stopRow/removeRow/setRpc(wire rpc 注入)+ PluginHost 行增强(版本选择器/运行 run|update/停止/移除/重试下一版本/回滚)+ fixture 内存清单端点全链;probe-cordis-panel fixture 6/6 + real 6/6 |
| `(本轮,见 git log)` | 子代理目录树 + 只读 composer ⑩:vendor ui-subagent(目录树/只读 composer)+ ts-types dsh-subagent 占位(subagentTiming 投影 merge)+ 会话头目录树座位(openChild=selectSession)+ ComposerSeat 只读分支(priority -10 语义)+ fixture subagents.list 目录样本;probe-subagent fixture 6/6 + real 6/6 |
| `(本轮,见 git log)` | Miller 目录浏览弹窗 ⑨:vendor ui-directory-picker-browse(DirectoryBrowser;Translate 改从 ui-slots 导入)+ zion 适配(host.listDirectory/createDirectory → workspace.create)+ WorkspaceMenu 新建工作区改开应用内弹窗;probe-directory fixture 9/9 + real 9/9 |
| `(本轮,见 git log)` | Agent 预设四表面:vendor ui-agent-preset(4 组件+3 控制器+PresetMenu+locales)+ zion 适配(三控制器/四座位/rosterChanged 联动)+ manager 快照补 ids/byId 等位 + ui-settings 等位 SlotMap + fixture settings.update 补 agent-presets ns + 深绿调色板补缺令牌(修上一轮浅色误值);probe-preset fixture 10/10 + real 9/9 |
| `(本轮,见 git log)` | composer 接管 ⑦:vendor ui-user-questions(QuestionComposer/PlanReviewPanel;去 merge import)+ 激活 vendored ApprovalPanel(两处 surgical)+ tsconfig paths → vendored chat-nodes.ts(官方 ChatNodeDataMap 增强 merge)+ ui-layout 等位 SlotMap + 移除重复 SlotMap 声明(TS2717)+ ComposerSeat 链选举 + 移除 M3 InteractionDock;fixture 常驻审批配对在飞 bash(turn 78)+ 稳定 question rpcId + 探针缝 rpcId;probe-takeover fixture 8/8 + real 8/8 |
| `(本轮,见 git log)` | 触发菜单 + popupSelect:vendor ui-input-trigger(core/controller/MenuView,controller actx 本地化)+ ui-commands(popup/PopupSelectView)+ primitives useAnchoredMaxHeight;zion 管线(command/skill 源 + /permission 装饰 + actx shim + track 去重)+ InputBar 接线;probe-trigger fixture 9/9 + real 9/9 |
| `(本轮,见 git log)` | SkillRow 专用工具卡:vendor ui-skill(surgical ToolCallViewProps 本地化)+ ChatView skill 分支(settled 名取自 block.call.name)+ fixture turn 76 skill 样本;probe-skill fixture 5/5 + real 5/5 |
| `(本轮,见 git log)` | 产物行 + WorkflowRun 面板:vendor ui-deliverables/ui-workflow-run(+primitives DisclosureRow/MarkdownFileMentions;deps dsh-tool-workflow/dsh-workflow)+ 注册两个 Definition + ChatView turn-tail 产物行/keyed 面板 + fixture locations/tool-workflow 样本;probe-deliverables fixture 6/6 + real 6/6 |
| `(本轮,见 git log)` | 附件 Lightbox/拖放覆盖层:vendor ui-attachment 整包(4 组件零 cordis)+ ChatView 消息图片(ImageGallery,loader=readAttachment)+ InputBar AttachmentRail/DropOverlay/Lightbox + document 拖放监听;probe-attachment fixture 8/8 + real 8/8 |
| `(本轮,见 git log)` | 消息时间戳收尾:激活 vendored MessageIconActions(图标复制/分支 + hover 时钟 + user 行动作),补 primitives writeClipboard / locale-common(common 词表)/ forkSession select 重试;probe-msg-actions fixture 8/8 + real 8/8 |
| `(本轮,见 git log)` | JobListAction 会话头作业 badge:vendor ui-jobs + ui-primitives 补 StateDot/useDismissOnOutsidePointer + 会话头座位 + __zionProbePushMuxFrame 探针缝;probe-jobs fixture 9/9 + real 10/10 |
| `b7be773` | QueueDock 行内编辑(updateQueue edit)+ InputBar 运行中排队发送;fixture edit 分支真实替换;probe-queue-edit 3/3 |
|---|---|
| `6fa73d5` | 拖拽重排 + 溢出展开:组内会话行拖拽(上/下半标记 → insertSessionBefore)、工作区组头拖拽(insertBefore)、host/workspace-* 帧自动刷新账目、溢出折叠 5 行 + 「+N」展开;probe-sidebar-drag fixture 6/6 + real 6/6 |
| `b193d83` | 会话行 … 菜单(重命名 Modal/fork 省略 atSeq 选中子代/archive)+ 视图选项菜单(groupBy workspace|flat 按 WorkspaceView.sessionIds、orderBy manual|updated);runtime sessionRowActions;fixture archive 补 host/session-removed;probe-workspace-actions fixture 8/8 + real 8/8 |
| `346fcad` | 信息层三件套:runtime 通用 useProjection(per-key uSES)+ ContextMeter/StatsLine/TodoDock seat;ts-types 补 token-meter/session-stats/tool-todo 占位;probe-composer-stats fixture 6/6 + real 7/7 |
| `c2a1467` | 权限三面 + Plan chip:vendor ui-permission-presets/ui-plan/schema-form + ui-primitives 补 Menu/Button/Modal/RiskConfirmation;Settings 权限默认行 + composer 权限 chip(Full access 风险确认)+ PlanSeat;fixture 扩展 permission ns;probe-permission-plan fixture 12/12 + real 12/12 |
| `beed201` | 消息行动作:复制 + 分支(fork at anchorSeq),real 6/6 |
| `396255a` | dynamicCordisRunner 编排 UI:运行控制台(inventory+Run/Update)+ 审批卡「批准并信任」,real 7/7 |
| `06dc363` | 模型两级菜单:vendor ui-model-selection 替换扁平 select,real+fixture 7/7,回归 24/24 |
| `35723e6` | 设置二期:Provider 编辑(API key + 模型目录 + discoverModels 探活),real 10/10 |
| `e188d21` | 设置一期:壳+分区导航+通用(外观/语言 读写真后端),real+fixture 11/11 |
| `8ef3b62` | TrajectoryView:vendor ui-trajectory + 会话头 tabs,real 6/6 + fixture 10/10 |
| `667d5ce` | 真后端专属项核验 26/26(模型守卫/settings/credentials/llm/cordis/export/updateQueue)+ 归因文档 |
| `1a0cea3` | 功能接线:session.create / 命令面板 / goal 编辑器 / 工作区 / subagent / 队列场景 |
| (更早) | M1 diff 卡 `2877299`、两份审计 docs `27fc77d`;M6 之前链条见旧版 §1 已并入 git log |

---

## 2. 架构与运行(不变 + 新增)

### 架构事实(仓库注释 + 旧 HANDOFF §1 有;摘要)
- 数据层 = 官方纯类 B 直拼:`renderer/vendor/`(现 **12 包+类型占位**,§4 有清单)由 Vite 直编;装配 `protocol/assemble.ts`;React 侧 `app/runtime.tsx` 用 `bindSnapshotSelector`.
- 对话定义层 = 一个「UI 逻辑面」`new Context()`(`app/conversation.ts`),注册 chat 节点 + **trajectory 6 个节点 Definition**.
- 插件底座 = `renderer/src/plugin/`(runtime/slot-registry/evaluator/guard/hub/remote/run-orchestrator/anchors).
- **两条运行线(别混淆)**:复刻线 = `npx vite preview ... --port 5199`(或 `dev:web`)经 `/api` proxy 连 3080,不带 `?fixture` 即真后端;**Electron 壳线有两条**:`npm run start:replica`(= `electron . --replica`)加载**复刻界面**——主进程自动 ensure 3080 后端、`renderer/dist` 缺失时先 `vite build`、再起 5199 preview 代理 `/api`(+ws)后开窗;旧 `npm run dev/start` 仍是 prototype 遗留(加载官方 3080 UI,不是复刻).
- 探针:`npx electron <probe>.mjs` 无头加载 `http://localhost:5199/[?fixture]`;fixture 页 authority 必须 `?fixture`.

### 本会话新增关键机制(vendor + 适配层)
- **官方 UI 包 vendor 流程**(补差距的标准做法):
  1. 拷贝:`D:\github-Clone\deepseek-harness\packages\client\<pkg>\src` → `renderer/vendor/<pkg>`(TS 源码直编).
  2. `renderer/vite.config.ts` 加 alias;`renderer/tsconfig.json` `paths` 加映射(type-only 缺失包用 `renderer/vendor/ts-types/*.d.ts` 空占位).
  3. 依赖入 `package.json`(本轮已加 `@tanstack/react-virtual`、`diff`、`clsx`).
  4. **适配层**:官方组件经 cordis 槽注入面;zion 手写 adapter 补齐注入(参考 `src/app/trajectory-pane.tsx`、`src/app/model-select.tsx`).
  5. `npm run build:web` + 探针(real/fixture 双轨)+ tsc(`src/` 0 新错;vendor 的 cordis 类型噪音是既有预期).
- **官方 declare-module 增强的 zion 解析法**(本轮,P3-⑦):官方各 conversation-nodes/*.ts 以
  `declare module '@deepseek-ai/dsh-client-ui-conversation/client'` 增强 ChatNodeDataMap;
  zion 无该包 → tsconfig `paths` 把包名解析到 **声明该接口的 vendored 模块文件**
  (`vendor/client-ui-conversation/client/contract/chat-nodes.ts`),增强即真实 merge
  (ChatNodeKind 键源齐全,9 个基线错误文件清零);同法适用于任何「官方 declare module 增强
  某接口」的包,前提是该包名不被其它具名导入消费(消费其它导出会断)。
- **vendor 包现状**:`client-connection / client-runtime / client-ui-conversation / client-ui-slots / client-web-react / ui-primitives(最小面:icons 全表 + Tooltip + JsonTree/MarkdownText/Toast/plain-text + Menu/Button/Modal/RiskConfirmation/pointer-grace)/ ui-trajectory(完整)/ ui-model-selection(完整)/ ui-plan(完整)/ ui-permission-presets(完整)/ ui-user-questions(完整)/ ui-agent-preset(完整)/ schema-form(完整)+ ts-types`.alias 与 paths 均已配好,后续 vendor 新包照抄;npm 依赖另加 `@deepseek-ai/schemastery`(file: 官方链,schema-form 需要).
- **ui-primitives 是「最小等位面」**:icons 全表 + 官方 Tooltip + 自写 JsonTree/MarkdownText/Toast(plain-text 投影),刻意不拉整棵 micromark;整包 vendor 时整体替换。
- **workspace 账目自动刷新**(本轮,runtime.tsx):zion 不跑官方 WorkspaceRuntime,workspaces 状态此前只靠显式 reload;现接 host/workspace-changed|removed|added 帧自动 reloadWorkspaces(分组/手动排序/拖拽落点跟着变;fixture fork 时子会话因此正确入组而非落「未分组」)。
- **拖拽合成事件**(本轮,probe):dragstart/dragover/drop 需在事件间 sleep(React 状态提交是异步的,同步派发时拖拽源尚未就位);真实拖拽天然间隔足够。
- **fork 选中竞态**(上轮,runtime.tsx sessionRowActions.fork):host/session-added 帧可能晚于 RPC 响应到达,`sessions.select` 对未知 summary 抛错 → 重试至 deadline(3s/40ms)。真后端帧序通常先到,fork 既往路径(消息分支)未暴露。
- **useProjection 通用钩子**(上轮,runtime.tsx):per-key uSES 绑定选中会话 ProjectionValueStore,`undefined` = 能力缺失;官方第五框架席位。ContextMeter/StatsLine/TodoDock/PermissionSelect/PlanChip 全部经它读投影(useGoal/usePlanProjection/usePermissions 保持专用绑定不动)。
- **本轮 vendor 注意点**:
  - `ui-permission-presets` 的 settings-store 依赖 `@deepseek-ai/dsh-client-schema-form`(runtime)→ vendor schema-form(3 文件)+ schemastery npm 依赖;真后端 `permission` ns 的 schema 是 schemastery toJSON(refs/uid 引用表),`new Schema(envelope)` 直接可解析。
  - `PermissionRow`/`PlanChip` 需要的 SlotMap/LocaleNamespaceMap merge(`settings.general.item`、`conversation.input.plan`、`plan`)由 zion 适配文件 `declare module` 等位补齐(官方声明在未编译的 ui-settings/ui-conversation contract 里)。
  - 两个官方文件被微补丁(留注释标记):`skeleton/PermissionSelect.tsx` 的 `t` 类型本地化(不拉 contract/slots.ts);`ui-plan/client/PlanModeControl.tsx` 的 `PlanChipInjected` 本地化(不拉 cordis apply 的 index.ts)——都是避免把整套槽面拖进编译面的 surgical 修改,行为零改动。
  - fixture 的 `settings.describe` 扩展出 `permission` ns(schemastery envelope + mutate 往返),供探针走 Full access 风险确认全流程。

---

## 3. 后续工作(接任继续;执行索引 = `docs/ui-entry-gap-inventory.md`)

## 3. 后续工作(接任继续;执行索引 = `docs/ui-entry-gap-inventory.md`)

> 执行表按用户确认顺序排列(快分 → 中块 → 大块 → 收尾);每项照 §2 的 vendor 流程 + 探针验证(real/fixture 双轨),完成后回勾 inventory 并提交。规模为轮数估计(1 轮 ≈ 30–60 分钟紧凑工作)。

| # | 优先级 | 项 | 规模 | 关键要点 | 状态 |
|---|---|---|---|---|---|
| 1 | P0 快分 | **JobListAction 作业 badge**(ui-jobs) | 0.5–1 轮 | 计划见 §3A(StateDot/useDismissOnOutsidePointer 补齐 + ui-jobs vendor + 会话头座位 + __zionProbePushMuxFrame 探针缝);jobsBySession 数据已有 | ✅ `8714e2c` |
| 2 | P0 快分 | 消息时间戳收尾(MessageIconActions) | ≤0.5 轮 | 复制/分支已做(beed201);核对官方 chat/MessageIconActions 的 hover 时间戳与当前 chat-node-actions 差异,补齐即可 | ✅ `ab82cd6` |
| 3 | P1 中块 | 附件 Lightbox / 拖放覆盖层(ui-attachment) | 1 轮 | 先确认 ChatView 消息图片渲染现状(输入侧已支持图片);vendor MessageImage/ImageLightbox/DropOverlay/AttachmentRail 4 组件,MessageImage 点击 → Lightbox 全屏;拖放覆盖层挂 InputBar | ✅ `8f78ee7` |
| 4 | P1 中块 | ProducedFiles / WorkflowRun 面板(ui-deliverables / ui-workflow-run) | 1 轮 | 节点 Definition 注册(参考 trajectory 注册链,conversation.ts);deliverables 投影/事件面先探真后端是否推送 | ✅ `d979255` |
| 5 | P1 中块 | skill 行(ui-skill) | 1 轮 | skill.list RPC 已在 wire(fixture 有 skill.list 分支);SkillRow 槽面声明 + Sidebar/会话头座位 | ✅ `11fbe84` |
| 6 | P2 大块 | **`/` `@` 触发菜单 MenuView + popupSelect**(ui-input-trigger + ui-commands) | 1–2 轮 | 全仓库最大 vendor 块;含 `/permission` popupSelect 装饰(承 P1);InputBar 输入触发改造(键入触发、候选行、popupSelect shell);CommandUiContract 类型 stub 已在 ts-types | ✅ `3b33aa2` |
| 7 | P3 收尾 | ApprovalPanel composer 接管 / PlanReview 区分 | 1 轮 | InteractionDock 现为旁路卡,官方替换 composer;ui-user-questions 的 PlanReview 与审批两形态 | ✅ `10e9273` |
| 8 | P3 收尾 | Agent 预设四表面(ui-agent-preset) | 1 轮 | 选择/copy/删除/查看/打开文档;agentPreset.* RPC 已在 wire(fixture 全分支) | ✅ `a57a536` |
| 9 | P3 收尾 | Miller 目录浏览弹窗(ui-directory-picker-browse) | 1 轮 | 680×500;hidden/新建目录;host.listDirectory/createDirectory 已在 wire | ✅ `eeff657` |
| 10 | P3 收尾 | 子代理目录树 + 只读 composer(ui-subagent) | 1 轮 | 现右栏扁平列表;目录树下拉 + 展开/打开子级;subagents RPC 已通 | ✅ `0ab42de` |
| 11 | P3 收尾 | cordis 面板增强(run/stop/remove/版本/approve-plugin/retry-rollback)+ define/run 卡 | 1–2 轮 | 接已有 orchestrator + remote;PluginHost 控制台补 stop/remove 等(现 disabled 说明) | ✅ `09ae7cd`(define/run 卡留待真实工作负载按需 vendor,见 inventory) |

**已核 N/A(不必做)**:会话导出按钮(官方无 UI);消息赞/踩+备注(真后端 3080 无 messageFeedback.* 端点,404 已探);DetailsPanel(官方未接线);native 目录流(renderless)。

**✅ 全部 11 项已完成**(P0①-②、P1③-⑤、P2⑥、P3⑦-⑪;提交链见 §1 行首 5 个新提交 + 此前 7 个)。收尾标准逐项满足:官方 3080 基准核对 → vendor/手写 + 适配层 → build:web + 双轨探针(§4 表)→ typecheck 与基线持平(0 新错误文件;实际 23 文件/127 错,低于基线 30/162)→ 回勾 inventory + §1 + §0。goal 已标 complete。

**收尾标准(每项)**:① 官方 3080 为基准核对入口形态;② vendor/手写 + 适配层接线;③ `npm run build:web` + 双轨探针(新探针写进 §4 表);④ typecheck 与基线持平(对比 `baseline-errors.txt` 列表,31 文件,不新增);⑤ 回勾 inventory + HANDOFF §1 提交链 + §0 进度。全部完成即 §0 目标达成,goal 标 complete。

### 真后端核验关键结论(别重踩)
- **模型守卫**:`agent-default-model` = opencode-go / deepseek-v4-flash(reasoningEffort max);任何 LLM 调用都落它(`settings.describe`/`llm.providers`/`llm.models`/`session.models` 四重证据,见 `docs/real-backend-only-verification.md`).
- **400 归因**:`Error from provider (Console Go) ... tool_count_limit` = 上游 pi-ai 网关对 opencode-go 通道因**工具 schema 数超限**拒绝,与复刻无关;纯文本回合不触发。
- 探针选会话注意:点「根级(depth0)且非运行」行(子代理行模型 RPC 被拒 `agent-busy`;运行中会锁定模型选择器)。队列/轨迹快照经 **mux WebSocket**(真后端对 SSE GET `/api/events.mux` 回 426)。
- 3080 真后端常驻(勿重启,会话骑在它上);需 5199 时先起 preview,源码改动后先 `npm run build:web`(preview 服务的是 dist/)。

---

## 4. 探针清单(全部可用:`npx electron <name>.mjs`;输出 `probe-*-out/` 已 gitignore)

| 探针 | 作用 | 数据源 | 结果 |
|---|---|---|---|
| `probe-checklist.mjs` | 24 项真后端回归(模型席断言已按两级菜单更新) | 3080 | 24/24 |
| `probe-inspector-fixture.mjs` | 官方页面召唤器全链(入口/模块捕获/配方/GoalBar 舞台/声明关闭与点击可达/整页刷新重捕获;隔离控制口,不动 3080) | 3080 页面 + fixture | 8/8 |
| probe-queue-activation.mjs | 队列激活探针(真后端:运行中发第二条 → QueueDock 排队行;复用 inspector 配方引擎;探针自清理) | 3080 | 7/7 |
| `probe-backend-only.mjs` | 真后端专属项(模型守卫/settings/llm/credentials/cordis/export/updateQueue) | 3080 | 26/26 |
| `probe-trajectory.mjs` | 轨迹视图(tabs/工具栏/搜索/切换) | fixture | 10/10 |
| `probe-trajectory-real.mjs` | 轨迹视图真实回合账本渲染 | 3080 | 6/6 |
| `probe-settings.mjs` | 设置壳/通用(外观三 cube+语言 读写真后端) | 3080+fixture | 11/11 |
| `probe-settings-editor.mjs` | Provider 编辑(模型目录增删往返/凭证态/探活) | 3080 | 10/10 |
| `probe-model.mjs` | 模型两级菜单(根/模型/Effort/选择/锁定)+ M6b 独立 mi-think 元素(微簇 data-level 等级) | 3080+fixture | 8/8 |
| `probe-cordis-console.mjs` | cordis 运行控制台 + 批准并信任 | 3080 | 7/7 |
| `probe-msg-actions.mjs` | 消息复制/分支(fork+选切子会话) | 3080 | 6/6 |
| `probe-permission-plan.mjs` | 权限行(Full access 风险确认往返)/ composer 权限 chip / Plan chip(激活→关闭) | 3080+fixture | 12/12 |
| `probe-composer-stats.mjs` | StatsLine 统计条(位置 = 输入盒之后)/ 自研 Matrix TodoDock(整头 aria-expanded + 计数汇总 + 展开收起交互)/ C3b 微簇单行(chip+模型触发+ctx 胶囊+会话状态);ContextMeter 环已移除(2026-08-21 评审裁决,ui-change-log 立账) | 3080+fixture | 6/6 + 7/7 |
| `probe-workspace-actions.mjs` | 视图选项(分组/排序)/ 行 … 菜单(重命名/fork/archive) | 3080+fixture | 8/8 |
| `probe-sidebar-drag.mjs` | 拖拽重排(insertSessionBefore 顺序落点)/ 溢出折叠展开 | 3080+fixture | 6/6 |
| `probe-archive-filter.mjs` | 归档过滤(已归档不进 City Index/归档行消失/清空回归/入口保留) | 3080+fixture | 4/4 + 4/4 |
| `probe-jobs.mjs` | JobListAction 会话头作业 badge(注入帧徽标/列表排序/时钟实时走/外点+Escape 关闭/空帧消失;real 真实 jobs 数据) | 3080+fixture | 9/9 + 10/10 |
| `probe-msg-actions.mjs` | 消息行动作(图标复制/分支/hover 时钟/user 行/fork 选中子会话) | 3080+fixture | 8/8 + 8/8 |
| `probe-attachment.mjs` | 附件(消息图片缩略图/Lightbox/Escape;合成拖拽 DropOverlay → AttachmentRail → 移除) | 3080+fixture | 8/8 + 8/8 |
| `probe-deliverables.mjs` | 产物行(edit/write locations 派生 + chip 点击 openPath)+ workflow-run 面板(run 头/阶段展开/成员状态) | 3080+fixture | 6/6 + 6/6 |
| `probe-skill.mjs` | skill 专用工具卡(状态/标题/摘要 + 展开说明区/收起) | 3080+fixture | 5/5 + 5/5 |
| `probe-trigger.mjs` | 触发菜单(`/` 命令+技能组/过滤/pick 落文本/Escape)+ popupSelect(/permission 预设/执行/令牌移除) | 3080+fixture | 9/9 + 9/9 |
| `probe-takeover.mjs` | composer 接管(ApprovalPanel 审批卡+配对命令/允许一次 → QuestionComposer 三问 → 结算 InputBar 回归;合成 plan-review → PlanReviewPanel 决策卡+拒绝回执+结算离场;real 空闲回退) | 3080+fixture | 8/8 + 8/8 |
| `probe-preset.mjs` | Agent 预设四表面(hero chip 暂存→新建会话自动应用→会话头标签;通用区默认行往返;分区:复制对话框/只读查看器/删除确认/设默认;real 真实 roster 只读) | 3080+fixture | 10/10 + 9/9 |
| `probe-directory.mjs` | Miller 目录浏览(主目录单栏/双栏推进/新建文件夹/路径编辑/显示隐藏/打开创建;real browse 能力缺失诚实报错面) | 3080+fixture | 9/9 + 9/9 |
| `probe-subagent.mjs` | 子代理目录树(计数徽标/展开/打开子级)+ 只读 composer(一次性/父离线)+ 会话层级面包屑(进入子会话显示祖先链,点主会话段回父) | 3080+fixture | 7/7 + 7/7 |
| `probe-cordis-panel.mjs` | cordis 面板增强(版本选择器/运行/停止/移除/重试/回滚 + 审批卡;real 面板端点确定性业务拒绝) | 3080+fixture | 6/6 + 6/6 |
| `probe-ambient.mjs` | ZION 氛围层(#rain/.scanlines 挂载与 z-index、三字体加载、body 字体链、全 UI 表面 alpha 0.92、fx 两档往返[fixture 真 prompt 驱动]、雨幕动画活) | fixture | 14/14 |
| `probe-conversation.mjs` | ZION 会话区(回合分组 .turn-agent、活动雨轨 canvas/闭环 .seal ◆、ThinkBlock 折叠+磁带纹、流式 .caret、中断 .aborted 终态文案、user OPERATOR 头+注入解码、继电器工具卡 .trace.track/.unit/.contact/.dur、diff 烧录编舞) | 3080+fixture | 19/19 + 19/19 |

> 2026-08-28 ASCII 会话城侧栏落地:probe-checklist / workspace-actions / sidebar-drag / archive-filter / composer-stats / permission-plan / conversation / msg-actions 共 8 个探针的侧栏相关腐化断言已按新结构(`.sidebar` 工具条 / `.map-row[data-session-id]` / City Index)重写,结果列口径不变;probe-conversation A9 改 turn-tail 口径。**新坑**:无头窗口 CSS transition 被 occlusion 冻结,索引行文本断言一律用 `textContent`(`innerText` 取不到);`.map-row` 只在 City Index 展开时渲染,探针须先点 `.map-toggle` 再等行。
> ⚠️ `probe-backend-only` 现为 **24/26**:A1/A6 断言的默认/会话模型期望 `opencode-go/deepseek-v4-flash`,而真后端 3080 当前选中为 `deepseek-official/deepseek-v4-flash`(后端侧模型选择漂移,与本次改动无关;待后端选回后恢复 26/26)。
> ⚠️ `probe-permission-plan` 现为 **10/12**:P3/P7 断言的权限默认值期望 `Full access`,真后端当前为 `workspace-write`(后端侧权限默认漂移,机械断言全过;恢复 12/12 需后端默认回 Full access)。

### 3A. JobListAction 实施记录(✅ 已执行,commit 见 §1 行首)
- 数据:zion manager 已有 jobsBySession(useSessions(s => s.jobsBySession[id]) 读,由 session/jobs mux 帧填充;fixture 不产生 jobs)。
- vendor 依赖补齐:ui-primitives 缺 StateDot(svg+css)与 useDismissOnOutsidePointer(hook)——官方 packages/client/ui-primitives/src/ 直拷 3 文件(StateDot.tsx/.module.css + use-dismiss-on-outside-pointer.ts),index.ts 增导出。
- vendor ui-jobs(client:index.ts / JobListAction.tsx / JobListAction.module.css / locales.ts);props = PropsRuntime<"conversation.session.header.actions"> & PropsLocale<"jobs"> → 需在 zion 适配 declare SlotMap "conversation.session.header.actions"(官方 ui-conversation contract/slots.ts 声明,kind list,scope session)+ LocaleNamespaceMap "jobs"。
- 座位:ConversationDock 会话头加 JobListActionSeat(useSessions=runtime.useSessions;sessionId=selectedId;t=zh 字典;无 jobs 时组件自返 null)。
- 探针:RuntimeProvider start 时(isFixture 限定)挂 window.__zionProbePushMuxFrame(frame) 直调 runtime.wire.sessions.handleMuxEnvelope({ rpcId: crypto.randomUUID(), payload: frame });探针注入 { type: "session/jobs", sessionId, jobs: [...] } 帧 → 徽标与列表出现;真后端只验证零错误(无 jobs 时隐藏)。
- 注意:JobView 类型来自 client-runtime(查 manager import 源头);manager.ts 705 行已有 "session/jobs" 帧分支。
(更早的 M 探针:probe-m3/real/official-real/hero/plugin/queue/cordis-*/hostcall/queue-ops/approve-* 仍在仓库。)

---

## 5. 开发约定挖坑清单(本会话新增,别重踩)

- **Windows EIO(ReplaceFileW EIO Win32 32/1175)**:esbuild/vite tsserver 持有文件句柄缺 `FILE_SHARE_DELETE`,直接 write/edit 被拒。**手法:把新内容写到临时文件(`xx.new`/`xx.cdnew`),再用 PowerShell `Copy-Item -Force` 覆盖目标**(in-place CopyFile,不需 Delete 共享);或对单点用 PowerShell 字符串 Replace + `[IO.File]::WriteAllText`。EIO 是已知环境行为,**不是 bug,换手法即可**。
- `write` 到已被删除的 `.new` 路径会报「file no longer exists」——换一个全新临时名。
- 探针用 React 受控输入:必须原生 value setter(`Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v)` + dispatchEvent('input'))。
- tsc 只查 `src/`:vendor 的 cordis/Fiber/ctx 类型噪音是既有预期,`grep -v vendor` 过滤看新错。
- 探针可用 `window.__zionProbeHandleRemoteEvent(...)` 注入 `cordis/request-run` 帧测审批。
- 探针 JS 字符串经外层模板字面量转发:`split('\n')` 会被外层转义成真换行导致页面 SyntaxError——用 `split(String.fromCharCode(10))`。
- `npm run typecheck` 基线本就有 200 行错/31 文件(模型 select 的 t prop、runtime 投影 cast、vendor cordis 噪音等,历史遗留);验收口径 = **对比基线不新增错误文件**(Compare-Object 两份 error 文件列表)。
- 设置/菜单按钮的 `aria-haspopup` 全页面多个(工作区/模型/权限),探针选择器要限定作用域(`.settings-shell button[aria-haspopup="menu"]`)。
- 探针模板字面量里引用的循环变量必须 `${i}` 插值(直接写 `i` 会 ReferenceError);跨行匹配用 `split(String.fromCharCode(10))` 而非正则 `\n`(外层模板会把它转义成真换行)。
- **无头隐藏窗口 rAF 被 occlusion 节流**:rAF 驱动的乱码帧(注入解码/中断锁定)不定时不走帧——探针侧用 waitFx(capturePage 强制 BeginFrame,边拍边等);真实可见窗口无此问题。
- **fixture 短回复流式窗口仅 ~560ms**:400ms 轮询会错过活动态——用 `render markdown` 触发长回复 + 80ms 轮询捕流式。
- 探针内 regex 字面量(node 侧)不需要双反斜杠;只有经模板字面量转发进页面 eval 的才需要。

---

## 6. 环境与换机

- 工作区 `D:\deepseek-zion`;origin=github.com/elephanttalkheads/deepseek-zion(main)。
- Node/DSH:Windows;`C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\`(rc.7);DSH_HOME=`C:\Users\zyf\.dsh`;官方 npm 链 `...\.dsh\profiles\node_modules\@deepseek-ai\`(rc.7,file: 引用;junction 到底层链)。
- 官方源码 clone:`D:\github-Clone\deepseek-harness`(HEAD `dsh-v0.1.1-rc.2`;vendor 源、契约查证都看它)。
- 常用命令:`npm run build:web`(= vite build -c renderer/vite.config.ts)、`npx tsc --noEmit -p renderer/tsconfig.json`、`npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort`。
- ⚠️ `npm run dev/start` 是 Electron 壳(proto 遗留,加载官方 3080 UI,非复刻);看复刻走 5199/`dev:web`,或 `npm run start:replica`(Electron 窗口加载复刻界面,自动 ensure 3080 + 缺 dist 先 build + 起 5199 preview,main.mjs `--replica` 分支)。
- 换机:`npm install`;`file:` 依赖是机器绝对路径(C 盘 profile / dsh 内嵌),换机改路径或 vendor 面包(SYNC.md 换机链);vendor 已含 10 包不额外装。
- ⚠️ **2026-08-20 dsh 更新注意事项**:全局 CLI 已 `npm install -g @deepseek-ai/dsh@0.1.0-rc.7`(registry latest;next=rc.8)。结构:profile 的 `@deepseek-ai/*` 全是 junction → nvm 全局 `dsh\node_modules\@deepseek-ai\*`(同一份,两层)。CLI 依赖范围 `^0.1.0-rc.x` 按 semver 取最新满足者 → **更新后依赖树整体漂到 rc.8(185/194 包)**,CLI 本体 rc.7;这是正常解析结果,全局无 lockfile 锁不住,接受即可。① **下次重启 3080 后端后必须跑 real 轨探针回归**(rc.8 装配契约可能微漂,漂移项记 §4 表);② zion 重新 `build:web` 时 `file:` 依赖解析 rc.8 文件,与 vendor(官方 clone rc.7 tag)源码可能有契约差,build/探针出异样优先怀疑此处;③ profile 里 `dsh-client-*`(schema-form/ui-primitives/ui-slots/web/web-react)5 个 junction 成死链(rc.8 树已移除这些包)——无影响(zion 15 个 file: 依赖不含 client-*;UI 层走 vendor 源码直编),留待复活或清理;④ npm 11 `allow-scripts` 默认拦 install 脚本,但 koffi/node-pty 预构建随包分发(require 实测 OK),无需 approve;若日后真依赖脚本的包装不上,用 `npm approve-scripts <pkg>`。

---

## 7. 红线(改代码前必看,`CONTEXT.md` 同源)

R1 宿主组合零改动;R2 wire 契约零改动(52 RPC + respond + 双 WS + session.export 只消费);R3 事件订阅完整(别丢 `host/remote-event`、`session/queue`);R4 会话语义不变(不伪造遥测);R5 无 prompt/工具/权限改动;R6 surfaceContext 保留;R7 动效不拖累主线程。

---

## 8. 建议启用的 skill(接任工作流)

- **`handoff`** — 每个大阶段/换会话前重写本文件。
- **`code-review`** — 对补差距的每一批提交做 Standards/Spec 双维 review(本会话方法:每轮 vendor+接线+探针+提交)。
- **`diagnosing-bugs`** — 探针失败回环(本会话多次据此定位:select 子代理行 agent-busy、mux SSE 426、React #310 hooks、remote 作用域 ReferenceError)。
- **`research`** — 查官方 `packages/client` 源码/契约时委托子代理;三次盘点就是这样拿到 `docs/ui-entry-gap-inventory.md` 的。
- **`writing-for-agents`** — 改 `AGENTS.md`/README/CONTEXT 等面向 agent 文档时先加载。
- **`grilling`** — 立项/目标范围不确定时压测(本项目靠 Q 系列决策定形)。
- **`vision-skills`** — 需要看截图/像素对照时(本模型无视觉输入,视觉校验留给有视觉模型的会话)。

---

*本文件由原开发会话持续维护;信息截至 `b7be773`(QueueDock 行内编辑;跨机交接)。接手后继续 §3 剩余项,按 AGENTS.md 记录。*
