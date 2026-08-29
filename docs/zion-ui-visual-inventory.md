# ZION UI 视觉块清单（迁移参考）

## 这是什么 / 给谁的 / 怎么用

本清单是源仓 **ZION**(`D:\pi-martix-ui-dev`，黑客帝国风 Electron 桌面 agent，已停止开发）UI 视觉体系的**组件/视觉块级迁移参考**，供在 deepseek-zion 中开新会话做 UI 重构时按块查阅。读者无需源仓上下文：每块给出源仓精确定位（组件/样式段/素材，`path:line` 格式）、视觉设计内容原文摘录、实现纪律原文摘录。摘录全部逐字摘自源仓文档，未改写。

用法建议：按块迁移（一块一次重构会话）；按本清单对应节查实现细节与纪律；块的术语（脑波褶/机械继电器/烧录显影/封存带/凝结雨轨/字形蛾/注入解码等）以源仓文档原文为准，勿自行改名。

## 源仓快照

- 源仓路径：`D:\pi-martix-ui-dev`
- 快照 commit：`f807437 docs: 记录工作区会话区实测尺寸`（2026-08-20 提取）
- 行号以该快照下实际读到的文件内容为准

## 数据源（仅从这 6 个文件提取）

1. `src/renderer/DESIGN.md`（主要来源：视觉/动效/架构决策）
2. `src/renderer/AGENTS.md`(21 条硬约束 + 关键入口）
3. `src/main/DESIGN.md`（经通读确认基本无视觉内容，见文末覆盖说明）
4. `src/main/AGENTS.md`（同上）
5. `src/shared/DESIGN.md`（类型契约，经通读确认无视觉内容）
6. `src/shared/AGENTS.md`（同上）

位置核实另查阅了真实代码：`src/renderer/src/components/*.tsx`、`src/renderer/src/styles.css`(1014 行，按注释分段）、`src/renderer/src/matrixGlyphs.ts`、`src/renderer/src/assets/`。

---

### 1. 数字雨氛围层（RainCanvas / #rain / FX 折算 speed/energy）✅ 已迁移

> 2026-08-23 落地:`renderer/src/ui/RainCanvas.tsx`(算法数值逐字)+ `renderer/src/app/ambient-fx.ts`(模块级 fx 两档,AppFrame 订阅选中会话 running 驱动,不进 React 渲染路径)+ `renderer/src/styles/ambient.css`(#rain/-.scanlines);字符集 `renderer/src/matrixGlyphs.ts`;demo 与截图:`ui-prototype/ambient/`。配套:全 UI 面板统一 alpha 0.92 半透明(tokens.css),雨幕透全屏。

**精确定位**
- 组件：`src/renderer/src/components/RainCanvas.tsx`(:72 `90/fx.speed` 帧节流；:9-11 字符取自 `MATRIX_CHARS`)
- 样式：`src/renderer/src/styles.css:56-68`（环境层段；`#rain` 在 :59,z-index -1)
- 其他：`src/renderer/src/matrixGlyphs.ts:4`（字符集）;`fx` 模块级对象在 `src/renderer/src/store.ts`

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> **布局**(App.tsx)：氛围层（`#rain` / `#signal` / `.scanlines`,fixed）与 `#stage`(z-index 5，四区）同级。（「架构与主要流程」L13)

> **FX 派生**:`setSessionState` 同步 `Object.assign` 到模块级 `fx` 对象（READY `{speed:1, energy:0.3}` / 忙碌 `{speed:2.2, energy:0.85}`);RainCanvas 与 TurnRail（均 `90/fx.speed` 帧节流）直接读取，不触发 React 渲染。（「架构与主要流程」L50)

> - **4 态状态机 + 两档 FX**（非连续插值）:ADR 0002 明确"不区分首次/持续 busy",FX 只有 READY/忙碌两档——勿改回 v3 的 rAF 指数衰减。（「设计决策与权衡」L117)

> - `#rain` 负 z-index 的用途：即使 `#stage` 层叠上下文失效，雨幕也恒在 UI 之下；氛围层均 pointer-events:none，不拦截交互（层级数值见 AGENTS.md 硬约束 6)。（「不变量」L164)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 1. **FX 不进 React 渲染路径**：氛围组件与雨轨（RainCanvas / TurnRail）直接 `import { fx } from '../store'` 读取 speed/energy(`90/fx.speed` 帧节流）；不要复制进组件 state，也不要自行插值。`fx` 是模块级对象，仅 `setSessionState` 时改写（两档取值见 `DESIGN.md`「架构与主要流程」FX 派生）。（约束 1)

> 4. **动画/音效数值照规格原样提取**(FS=18、拖尾 0.035、`90/fx.speed` 节流、12% 亮头、L 路径 8px 采样、TAIL=18、扰码 620ms、闪烁 900ms、SND 7 音参数、雨轨 11px 双列）……禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

> 5. **reduced-motion 全套降级**:`REDUCED` 常量在模块加载时求值；数字雨画静态帧、Neo 头像张嘴停静态帧且不脉冲、蠕虫直接命中；新动画必须自带降级分支。（约束 5)

---

### 2. CRT 与扫描线氛围（.scanlines) ✅ 已迁移

> 2026-08-23 落地:`renderer/src/styles/ambient.css`(.scanlines 逐字,z-index 40 / pointer-events:none),挂载于 AppFrame 根;同块 1 一并落地。

**精确定位**
- 样式：`src/renderer/src/styles.css:56-68`（环境层段；`.scanlines` 在 :60 起）
- 组件：无独立组件（`.scanlines` 为 fixed 装饰层，App 布局内）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> **布局**(App.tsx)：氛围层（`#rain` / `#signal` / `.scanlines`,fixed）与 `#stage`(z-index 5，四区）同级。（「架构与主要流程」L13)

> - `#rain` 负 z-index 的用途：即使 `#stage` 层叠上下文失效，雨幕也恒在 UI 之下；氛围层均 pointer-events:none，不拦截交互（层级数值见 AGENTS.md 硬约束 6)。（「不变量」L164)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 6. **z-index 分层不可破坏**:`#rain`=-1（恒在 UI 之下）、`#stage`=5、`.scanlines`=40(pointer-events:none)、`#signal`=60(pointer-events:none，蠕虫画布不拦截交互）……（约束 6，摘录与本块相关子句；完整层级表见第 18 节）

---

### 3. 蠕虫写入信号 + Neo 头像（SignalCanvas releaseWorm / NeoAvatar 双帧）

**精确定位**
- 组件：`src/renderer/src/components/SignalCanvas.tsx`(:54 `releaseWorm`;:117 `TAIL = 18`;:8、:14-15 字符取自 `MATRIX_CHARS`);`src/renderer/src/components/NeoAvatar.tsx`(:7-8 双帧 PNG import;:12 `wormActive > 0` 驱动张嘴）
- 样式：`src/renderer/src/styles.css:707-709`（蠕虫画布段，`#signal` 在 :708);`src/renderer/src/styles.css:161-214`(.neo-avatar 双帧切换 :161-182,700ms 释放脉冲 `.is-burst` :184);`src/renderer/src/styles.css:428-440`（蠕虫命中 `.breached` 行闪烁 + 扰码）
- 素材：`src/renderer/src/assets/neo-avatar/neo-idle.png`、`neo-talking.png`(120×120 透明双帧）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> 侧栏顶部为 Vite import 的透明 Neo 双帧 PNG(120×120，容器无底板/描边）；张嘴仅由蠕虫释放驱动（store `wormActive` 计数 > 0,`releaseWorm` 开始 +1、done -1),CSS 以 300ms `steps(1,end)` 在闭嘴/张嘴间切换，释放瞬间附带 700ms 缩放脉冲，reduced-motion 下停在静态张嘴帧且不脉冲。（「架构与主要流程」FX 派生，L50)

> **蠕虫入侵管线**（编辑类工具调用）:
> - `tool_execution_start` → `parseEditFromTool`：编辑工具集合 `edit/apply_patch/write/multi_edit/patch/batch_execute`;bash 走写操作启发式（echo/printf 提取文本；目标按重定向 `>>`/`>`（排除 2>&1)→ `sed -i` → `tee` → `cp` → `mv` → `touch` 顺序取，`/dev/null`、`nul` 排除）;`batch_execute` 取首个可解析命令。
> - 触发链：`triggerWorm`（同步路径，`wormedRef` 按 toolCallId 去重）→ `normPath`(`\`→`/`、去盘符）→ `matchTreeRow`(`.ft-row[data-path]` 精确或互为后缀）→ 未命中则 `scanTree` 刷新 → `openAncestors` 展开祖先 → 双 rAF 等渲染完成后重试 → 兜底 `.trace[data-toolcall=<id>]` 块行。
> - 动画（`releaseWorm`):Neo 头像嘴部（`.neo-avatar` rect × `MOUTH_X/MOUTH_Y` 比例点）→ L 形路径（先垂直后水平，8px 采样）→ TAIL=18 字符尾随（head 每帧 +3，尾节 35% 概率突变 + 抖动）；目标行可视区外先滚动侧栏居中；开始/结束各调一次 `wormStart`/`wormDone`（含提前返回路径），释放期间 Neo 张嘴。命中 `intrudeRow`:`.breached` 类 900ms 闪烁 + 文件名扰码 620ms 逐字符还原（`.` 不动）;done 回调 → SND.breach + 日志 + `revealEdit(toolCallId)`。
> - REDUCED:`releaseWorm` 直接命中，跳过动画，done 仍回调。（「架构与主要流程」L91-96)

> - **蠕虫同步触发**（事件回调内而非 useEffect)：防快工具的 `tool_end` 先于 React 渲染到达的时序竞争（App.tsx 头注释明示）。（「设计决策与权衡」L119)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 2. **蠕虫触发留在事件回调同步路径**(App.tsx `triggerWorm`)：不得改为 useEffect 触发（时序原因见 `DESIGN.md`「设计决策与权衡」蠕虫同步触发）。（约束 2)

> 4. **动画/音效数值照规格原样提取**(……L 路径 8px 采样、TAIL=18、扰码 620ms、闪烁 900ms……)：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

> 5. **reduced-motion 全套降级**:……蠕虫直接命中；新动画必须自带降级分支。（约束 5，摘录与本块相关子句）

---

### 4. 侧栏与会话培育仓（Sidebar / SessionPod / 全息摘要层 / 名称牌） ✅ 已迁移(ASCII 会话城替代设计)

> 2026-08-28 落地(替代设计):本块培育仓/全息层设计未直接搬入——按用户指定,侧栏改以 pi-martix-ui-dev 的 ASCII 会话城原型(`docs/ascii-cyberpunk-sidebar-design.md` + `ui-demo/ascii-cyberpunk-sidebar-prototype.html`)为源迁移:`renderer/src/ui/sidebar-city/`(city-engine/useWorkspaceCityModel/useCityCamera/CityFrame/CityIndex)+ `renderer/src/ui/Sidebar.tsx` 整体重写 + `renderer/src/styles/sidebar.css` 全量重写;demo 与截图:`ui-prototype/sidebar/`(决策过堂 `DECISIONS.md`);新增「添加工作区」入口记账 `ui-change-log/2026-08-28--sidebar-add-workspace-entry.md`。

**精确定位**
- 组件：`src/renderer/src/components/Sidebar.tsx`(:412 共享 `.session-hologram-layer`);`src/renderer/src/components/SessionPod.tsx`(:4-5 双帧 PNG import（closed / damaged 开仓帧）;:91-92 双帧 `<img>` ref 注册）
- 样式：`src/renderer/src/styles.css:92-101`（侧栏段）;:148-160(`.side-resizer` 拖拽热区）;:215-247(`.deck` 三槽会话列表，:231);:248-411（会话培育仓段，含 `.scard`、名称牌、`.session-hologram-layer` :365-410);:441-452(Project 标题行 + 「⇄ 切换项目」按钮）
- 素材：`src/renderer/src/assets/session-pod-horizontal-closed.png`、`session-pod-horizontal-damaged.png`(closed/open 双帧；open 帧实为 damaged 素材）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - 区2 侧栏 `.sidebar`(`width: var(--side-w, 232px)`，默认 232，可拖拽调宽；整栏不滚动且 `position: relative; isolation: isolate` 承载共享全息层与本地动态 SVG 链路层）:`.core-wrap`(Neo 头像，固定）→ `.side-section.sessions`（高度 `clamp(244px, 36vh, 320px)`：三等高培育仓槽位 `.deck` 内部滚动）→ `.side-section.projects`(flex 3:`.side-head` 标题行 = 项目 basename（全路径在 title 属性）+「⇄ 切换项目」按钮 + 文件树 `#file-tree` 内部滚动）→ `.side-foot`（固定，workspace 文案）（「架构与主要流程」L15)

> **会话切换/新建/重命名/删除**(Sidebar + SessionPod):`.deck` 固定三等高槽并按槽吸附滚动；每仓保留 `.scard` 查询类，外层 `role="button"`，点击/Enter/Space 调 `selectSession` → `switchSession`（主进程懒创建实例，可能秒级；`switching` 锁防并发）→ `applySession`;`newSession` 同理；失败走 `log('err')`。中央名称牌常驻，标题统一走 `deriveSessionTitle`，编号为列表索引 + 1；只有名称牌 hover/focus 时展示等高的重命名/删除按钮。Sidebar 持有唯一 `preview`，仓 hover/focus 时按 anchor/sidebar rect 测量共享 `.session-hologram-layer`，显示标题与 `firstMessage` 第一条非空行（无内容显示「尚无会话内容」)；离开/真正离焦/列表滚动立即隐藏。重命名：`startRename` 以当前显示标题为草稿，名称牌中央替换为 `.s-title-edit`,Enter/blur 提交 `commitRename`、Esc 取消；`renameSession` → `setSessions`，当前会话另 `setSessionTitle(name)`（只改标题，不重置 feed)。删除：`askDelete` 两段确认——首击进入待确认态（2.5s 自动复位），此时才由 closed 帧切到 open 帧；再击先清待确认态再 `doDelete` → `deleteSession`（软删，移入 `.trash` 可恢复）→ `setSessions`；删除的是当前会话时主进程指针已落最近会话，`getCurrentSession` 重拉 + `applySession`（标题取新列表匹配，兜底短码）。（「架构与主要流程」L56)

> - **三槽培育仓与共享全息层**:`.deck` 用 `grid-auto-rows: calc((100% - 2 * gap) / 3)` 固定三槽，并用 `scroll-snap` 保证完整槽位；`SessionPod` 是 size query container，双帧宽度取 `min(108cqw, 324cqh)`——窄侧栏随宽度缩放，达到开仓帧可被槽高完整容纳的上限后停止放大并居中留白。closed/open 两 PNG 叠在同一绝对定位容器，只切 opacity，避免状态切换位移；两帧透明画布的可见底边接近同一坐标，中央名称牌用同一响应式几何贴住仓体底边。opened 帧不是选中/hover 反馈，只表示「已点击删除但尚未确认」；普通 hover/focus 只调亮 closed 帧。每仓只保留中央编号/标题/状态点，详细标题和首行摘要由 Sidebar 的单个绝对定位、`pointer-events:none` 全息层复用，避免每仓常驻多份面板与动画。（「设计决策与权衡」L125)

> - **侧栏分区滚动**(styles.css 注释明示）:`.sidebar` 整栏 `overflow: hidden`,`.core-wrap`/`.side-foot` `flex: none` 固定，会话/项目两区 flex 分割、`.deck`/`#file-tree` 各自 `overflow-y: auto`——列表过长只滚列表区，项目标题行与底部 workspace 行始终可见。（「设计决策与权衡」L127)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 17. **侧栏宽度只经 `.main` 上的 CSS 变量 `--side-w` 控制**(`.sidebar { width: var(--side-w, 232px) }`)：拖拽/键盘/双击复位一律走 `applySideWidth(w)`（写变量 + 同步 resizer `aria-valuenow`）与 `persistSideWidth(w)`(localStorage `zion.sidebar-w`）成对调用；**不要引入 React state**（机制与原因见 `DESIGN.md`「设计决策与权衡」侧栏宽度直写 CSS 变量）。常量 `SIDE_MIN=160`/`SIDE_MAX=480`/`SIDE_DEFAULT=232`/`SIDE_STEP=8`/`SIDE_STEP_BIG=32`/`SIDE_KEY` 与 `clampSide`（上限 `min(SIDE_MAX, round(innerWidth/2))`，且不低于 `SIDE_MIN`）在 App.tsx 模块级，改数值/边界只动这一处。（约束 17)

> 6. **z-index 分层不可破坏**:……`.side-resizer`=20（侧栏拖拽热区，负 margin 伸出两侧，须高于 sidebar/console 内容、低于 `.palette`=30 与 `.scanlines`=40)……（约束 6，摘录与本块相关子句）

---

### 5. 会话脑机链路（NeuralCableLayer / neuralCable.ts / 五段握手脉冲）

**精确定位**
- 组件：`src/renderer/src/components/NeuralCableLayer.tsx`(:33 `PULSE_TAIL_LENGTH = 6` 等脉冲常量）;`src/renderer/src/neuralCable.ts`（纯几何/身份映射，node:test 直测）
- 样式：`src/renderer/src/styles.css:102-147`(`.neural-cables-layer` 段，:103 起）
- 素材：`src/renderer/src/assets/neural-cable-system/`(`neo-neural-jack.svg`、`neural-bundle-ring.svg`、`pod-neural-receiver.svg`)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> **会话脑机链路**(Sidebar + NeuralCableLayer + neuralCable.ts):`NeoAvatar` 在 256×256 帧的 `(82,114)` 放置 18×14 接线口；`SessionPod` 注册 root 与 closed/open 两张实际图片，接收点统一取 1672×941 帧的 `(159,556)` 左侧机械柱。`NeuralCableLayer` 是 `.sidebar` 直接子级透明 SVG(z=1、pointer-events none；真实内容 z=2、全息层 z=30)，用 `ResizeObserver` 监听 Sidebar/deck/接线口/仓体与图片；resize、image load、deck scroll、窗口 resize、字体 ready 都汇入单个 rAF 测量。React StrictMode 冷启动下 effect 注册/清理会短暂交错，因此每次初始化观察和测量还会从同一 `.session-pod` DOM 只读收集实际图片作为兜底，不生成第二套几何来源。测量先求与 deck 相交的仓体，按距视窗中心选最近三个再按屏幕顺序分 lane；路径与终点始终用最新 DOM rect 换算到 Sidebar 本地坐标。六种神经签名由稳定会话 id hash 选择，不限制会话总数。状态优先级为 `active > hover/focus > dormant > hidden`:active 链路运行五段握手——光点弹头+5 字符尾的短脉冲以约 560px/s 从 Neo 发往培育仓（静态字符流全程让位）；脉冲尾端到达仓体后回传流生长（尾锚定仓体、头以约 140px/s 伸向 Neo 直至铺满全缆）；两端锚定维持 1s 传输（字符位置固定、内容异相突变，一道连续亮度波从仓体扫向 Neo 恰好一次）；再收缩（头锚定 Neo、尾以约 240px/s 追向 Neo 直至归零）；最后休止 0.6s。回传字符池按 `ceil(路径长/8)+2` 动态分配；两个方向的信号永不同屏，SVG path 本身仍按 Neo → 仓体定义，dormant 静态线路不反转。hover/focus 只增亮静态字符；dormant 完全静止。可见会话集合变化时旧三线 90ms 淡出，再替换身份/路径并以 90ms 淡入，任一时刻 DOM 不超过三线；当前会话滚出视窗时不画离屏线、不自动滚回。reduced-motion 关闭脉冲/回传与淡入淡出。该层是冗余拓扑反馈，不替代名称牌/文字/ARIA；全屏 `SignalCanvas` 继续只负责 Neo 嘴部到文件树的一次性写入蠕虫。（「架构与主要流程」L58)

> - **动态 SVG 而非固定连线图**：侧栏宽度可连续变化，仓体会在槽高上限停止放大且列表会滚动复用屏幕槽位；固定 PNG/SVG 线路无法同时守住这三种几何变化。运行时只保存真实端点引用和归一化素材锚点，每次测量重建三条 path；六种签名只提供稳定视觉身份，不绑定槽号。代价是增加 ResizeObserver/路径测量，但动画仅存在于一条 active 线路，dormant 无 rAF;ADR 0004 记录边界。（「设计决策与权衡」L126)

> - 会话脑机链路 DOM 数恒为 `0..3`；仅可见 active 链路启动字符脉冲，hover/dormant 不启动 rAF；路径终点必须来自当前 closed/open 图片 rect，禁止回退到固定屏幕像素。（「不变量」L175)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 19. **会话脑机链路只在 Sidebar 本地 SVG 内实现**：锚点必须从 Neo 接线口与当前 closed/open 图片的实际 `getBoundingClientRect()` 推导，侧栏 resize/仓体图片 load/列表 scroll 后经单个 rAF 重测；可见线路永不超过 3。状态优先级固定 `active > hover/focus > dormant > hidden`,dormant 禁止动画；不得把该系统并入全屏 `SignalCanvas` 或把线路当作唯一会话状态语义。数值与失败模式见 `DESIGN.md`「会话脑机链路」;**视觉实现细节与素材边界以 `docs/neural-cable-visual.md` 为准（程序化 SVG，不依赖连接态 PNG 素材）——修改脑机链路设计时必须同步更新该文档**。（约束 19)

---

### 6. 回合化消息流与 OPERATOR 注入解码（Feed / TurnView / OperatorBody） ✅ 已迁移

> 2026-08-27 落地:`renderer/src/ui/ChatView.tsx`(user 节点 OPERATOR 头 + 右对齐 .msg.user + 块级排版;**不迁回合聚合数据模型**,R4 守官方节点投影)+ `renderer/src/ui/chat-fx.tsx`(InjectDecode:min(700,240+len*6)ms、MATRIX_CHARS、只入场播一次、reduced-motion 直出;常开无 DEC 开关——用户裁决);样式 `renderer/src/styles/chat.css`;demo 与截图:`ui-prototype/conversation/`。markdown 解析(parseBody)不迁,守官方平铺渲染口径。

**精确定位**
- 组件：`src/renderer/src/components/Feed.tsx`(:76 `OperatorBody` 注入解码；:121 `Body` 正文解析渲染；:146 `ToolCard`;:200 `TurnView` memo 边界）;`src/renderer/src/markdown.ts`(`parseBody` 纯函数）
- 样式：`src/renderer/src/styles.css:453-521`（对话区段：`.msg` :495、`.msg.user` 右对齐 :502-506、`.msg-code` :515);:522-524（注入解码乱码帧 `.decoding`,Matrix Code 字形）;:535-541（回合容器 `.turn-agent` / `.historical`)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> **回合聚合模型与渲染队列**(store.ts):feed 数据不再是平铺 FeedItem 数组，而是 `turns`(id→Turn)+ `order`（渲染序）+ `activeTurnId`。Turn 分两类：`operator`（一次用户输入）与 `agent`(agent_start→闭环的执行周期）;agent 回合的 `content` 按到达顺序保序存放内容段（`text`/`thinking`）与工具条目（`tool`)。（「架构与主要流程」L38，摘录首段）

> **注入解码**(Feed.tsx OperatorBody):OPERATOR 消息入场时假名乱码逐位还原（时长 `min(700, 240+字符数*6)`ms，空格/换行保留；解码期间纯文本渲染，完成后交 Body 做 code/高亮/围栏解析）；只入场播一次（text/decOn 变化不重播）;DEC 关闭或 reduced-motion 直接 Body；开关 `decOn` 持久化 `zion.dec`（见 CONTEXT.md「注入解码」)。（「架构与主要流程」L46)

> **正文解析**(markdown.ts `parseBody` 纯函数，Feed Body / OperatorBody 解码完成后共用）:```（或 ~~~）围栏代码块 + 行内 `code` /【高亮词】；围栏开行可带语言标签（`lang` 只解析不展示）、未闭合宽容到文末、代码块内不做行内解析。代码块渲染为 `.msg-code` `<pre>`——简约样式（无边框无背景，唯一锚点是左侧 1px 弱线，与正文区分但保持密度）;markdown.test.mjs 覆盖 8 用例。（「架构与主要流程」L42)

> - **注入解码入场一次**:`useEffect` 空依赖（eslint-disable）保证只播一次，OPERATOR 文本更新不重播；DEC 开关与 reduced-motion 都直出原文。（「设计决策与权衡」L144)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 10. **消息文本渲染统一走 Feed 的 Body**(`parseBody`,markdown.ts)：行内 `` `code` ``、【高亮词】与 ``` 围栏代码块（`.msg-code`；围栏本身不渲染、块内不做行内解析）；不要另写 markdown 渲染。（约束 10)

> 16. **注入解码持久化键 `zion.dec`**(localStorage,`'0'`=关，默认开）：状态栏 DEC 按钮经 `setDecOn` 切换；`OperatorBody` 只入场播一次，DEC 关闭或 reduced-motion 时直接显示原文。（约束 16)

> 15. **agent 事件写入必须走 store 队列 API**:`queueDelta`/`armTurn`/`closeTurn`/`addUsage`/`toolStart`/`toolEnd`/`markInterrupted` 全部入队，rAF 时由 `_flush` 一次应用（每帧至多一次 store 更新，且只有活动回合对象换引用）……（约束 15，摘录首句）

---

### 7. 脑波褶思考块（.think / EEG / 沉降梯度） ✅ 已迁移(磁带纹横置重设计)

> 2026-08-27 落地:`renderer/src/ui/ThinkBlock.tsx`——**用户裁决:EEG 脑波褶由 `ui-demo/agent-reply-rail-proto.html` C 磁带纹横置替换**(竖划 1.4×(3~8)px、x 每 5px 一条、2.2px/60ms 向右走带、W+4→-4 回卷、6% 高亮簇、destination-out 0.10 拖尾;静态帧 rgba(20,184,80,0.28);reduced-motion 30 步静态帧);`<details>` 默认折叠(官方 ReasoningRow 等位入口,复刻此前缺失,本次补齐);「· 思考中…」与沉降梯度(0.38/0.55/0.72/0.86/1)保留。demo 与截图:`ui-prototype/conversation/`。

**精确定位**
- 组件：`src/renderer/src/components/Feed.tsx`(:251 `.think-body` 思考体行切片；`<details class="think">` 在 TurnView 内渲染 thinking 段）
- 样式：`src/renderer/src/styles.css:557-590`（思考块脑波褶段；`.think` :558、EEG `.eeg` :571-575、沉降梯度 :583-589)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> `thinking` → `<details class="think">` 默认折叠（脑波褶：summary 旁 EEG 折线，streaming 末段流动 + 「· 思考中…」；思考体按行切片，末 5 行 1→0.38 反向沉降梯度）（「架构与主要流程」L40，摘录 thinking 子句）

> - **thinking 默认折叠**:`<details>` 原生折叠不引入额外状态；「思考中…」由 streaming + 末 entry 判定。（「设计决策与权衡」L143)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 4. **动画/音效数值照规格原样提取**:……agent 回复重构数值照 `ui-demo/agent-reply-combo-proto.html`（脑波 0.8s/1.6s……)：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

---

### 8. 机械继电器工具卡（.trace.track / 触点 LED 三态 / 数码管 / 参数抽屉） ✅ 已迁移

> 2026-08-27 落地:`renderer/src/ui/ToolCallCard.tsx` 外壳重构 `.trace.track > .unit.{run|ok|err}`(触点 LED 三态 coil 0.8s/clack 0.3s/err 红逐字、DIN 导轨 34px 凹槽纹理、.dur 数码管——无真实耗时数据显示 `—`,R4 不伪造);展开区 ToolBody 全分支(terminal/diff/JSON/content/args/error)原样保留;样式 `renderer/src/styles/tool-cards.css`(旧 .tool-card-* 死样式三处 grep 零引用已清);demo 与截图:`ui-prototype/conversation/`。

**精确定位**
- 组件：`src/renderer/src/components/Feed.tsx`(:146 `ToolCard`);`src/renderer/src/toolfmt.ts`(`formatToolArgs`/`toolExpandTitle` 参数格式化纯函数）
- 样式：`src/renderer/src/styles.css:621-666`（工具链块机械继电器段；DIN 导轨 `.trace.track` :630-637、继电器单元 `.unit` :638-652、触点 LED 三态 `.contact` :641-647、数码管耗时 `.dur` :653-661、参数抽屉 `.trace-expand` :662-666)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> **机械继电器与烧录显影**(styles.css)：工具卡为 DIN 导轨（`.trace.track`，上下缘线 + 34px 凹槽纹理）上的继电器单元（`.unit`)——触点 LED 三态（run 琥珀线圈呼吸 `coil` / ok 绿 + `clack` 冲击波 / err 红）+ 数码管耗时读数（`.dur`)，点击展开铆钉参数抽屉（`.trace-expand` 参数全文）……（「架构与主要流程」L48，摘录工具卡子句）

> **工具链块参数展开**(toolfmt.ts 纯函数，Feed ToolCard 消费）:
> - `.step` 行 `role="button"` + `tabIndex=0` + `aria-expanded`，点击或 Enter/Space 切换 `toggleToolExpand`(store `expandedTools`,toolCallId 键）。
> - 展开渲染 `.trace-expand`:`te-title` = `toolExpandTitle`(args.file/path → `工具名 → 路径`，否则仅工具名）+ `<pre>` 全文 = `formatToolArgs`(bash → `command` 全文不截断；batch_execute → `commands[]` 逐行拼接；两者缺 command/commands 时与其余工具一致走 JSON 美化兜底，一律 `slice(0, 2000)`(MAX_JSON))。`pre` 限高 240px 内滚动、`pre-wrap` 防超宽行撑破卡片。（本轮视觉收敛：`.trace-expand` 为 `ui-demo/proto-detail-variants.html` 变体 A——裸文本流，无容器/无边框/无背景，与对话同密度；demo 已折入 styles.css，废弃）（「架构与主要流程」L103-105)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 4. **动画/音效数值照规格原样提取**(……)：禁止"优化"数值（ADR 0002)。（约束 4；本块数值含 `coil`/`clack` 动效，照规格提取）

---

### 9. diff 卡烧录显影（DiffCard / burn/char / 校验环自绘） ✅ 已迁移

> 2026-08-27 落地:`renderer/src/ui/ToolCallCard.tsx` 内 MatrixDiffCard(M1 已移植)数值审计对齐:BURN_CAP=30、行 delay=min(i,30)×0.09s、ring delay=min(rows,30)×0.09+0.9、ringDraw 1.2s、burn/cool 0.9s、char 1.1s、pathLength=400、基态=终态;**无蠕虫 revealedEdits 门控(块 3 未迁),直接渲染**;`.turn-agent.historical` 压平 + `.ring rect{stroke-dashoffset:0}` 例外随块 11 容器一并落地。

**精确定位**
- 组件：`src/renderer/src/components/DiffCard.tsx`(:23-25 校验环 SVG `pathLength={400}` + `vector-effect`);Feed 侧渲染门控在 `src/renderer/src/components/Feed.tsx`(ToolCard 内）
- 样式：`src/renderer/src/styles.css:667-706`(diff 卡烧录显影段；`.diff` :668、校验环 `.ring` :675-682、烧录行 burn/cool :689-700、焦化 char :701-706)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> diff 卡为烧录显影——新增行逐行白热闪光冷却成绿（`burn`/`cool`,90ms 阶梯、封顶 30 行）、删除行焦化红闪落 45% 余烬（`char`)，全部落定后 `.ring` 校验环自绘一周（SVG `pathLength=400` + `vector-effect` 与像素尺寸解耦，delay 由封顶行数推导）。所有入场动画基态 = 终态：`.turn-agent.historical`（历史重建）与 reduced-motion 压掉动画即为最终呈现，无需补偿帧。（「架构与主要流程」L48，摘录 diff 卡子句）

> - **diff 卡 reveal-after-hit**:Feed ToolCard 的 DiffCard 渲染受 `revealedEdits` 门控（完整渲染条件见 AGENTS.md 硬约束 3)，命中后烧录显影（逐行 `burn`/`char` 阶梯 + 落定校验环）——语义为"入侵成功后才显影写入痕迹"。（「架构与主要流程」蠕虫入侵管线，L95)

> - **revealedEdits 延迟渲染**：把"动画命中"与"diff 可见"绑定；目标缺失时 done 仍回调，卡片照样出现。（「设计决策与权衡」L120)

> - **入场动画基态即终态**：烧录/封存带等入场编舞只播"增量"（白热闪光、clip-path 展开），元素基态已是最终视觉——历史重建（`.turn-agent.historical`）与 reduced-motion 用 `animation: none` 压平即终态，不积累补偿样式（唯二例外：校验环 `stroke-dashoffset` 与 EOL 透明度需显式补终态）。（「设计决策与权衡」L145)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 3. **diff 卡渲染以 `revealedEdits` 为准**:Feed 中 DiffCard 仅在 `item.edit && revealedEdits[toolCallId] && rows.length > 0` 时渲染；不要在 `toolStart` 时直接渲染。（约束 3)

> 4. **动画/音效数值照规格原样提取**:……（烧录 90ms 阶梯封顶 30 行 + 校验环 1.2s……)：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

---

### 10. 封存带结算行（.settle / tape unroll / EOL / 中断撕裂变体）

**精确定位**
- 组件：`src/renderer/src/components/Feed.tsx`(:230 读取 `turn.settle`;:275-276 结算行渲染，`◆` seal-glyph)
- 样式：`src/renderer/src/styles.css:591-620`（结算行封存带段；`.settle` :592、`.tape` clip-path 展开 :598-606、EOL 方块 :607-612、中断/错误撕裂变体 :613-620)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> 闭环写结算行 `.settle`（封存带）:`◆ + 封存带（已结算/已中断/错误 · N tools · Σtokens · 耗时）+ EOL 方块`——tokens 为回合内各 turn_end usage 求和（`seenUsage=false` 时显示 null)，耗时为 `agent_start`→闭环的渲染层实测（performance.now，非 SDK 计时）;outcome 判定：`closeTurn('error')` → error，有 `interrupted` 标记 → interrupted，否则 ok;`!cur.settle` 守卫保证每回合至多一条。中断/错误版带尾撕裂锯齿、无 EOL。历史重建回合（`turn.historical`,applySession 标记）经 `.turn-agent.historical` CSS 压掉全部入场编舞，直接终态。（「架构与主要流程」L40，摘录结算行子句）

> - **结算行照常结算**：中断/错误回合也写结算行（标「已中断」/「错误」)——结算行是回合闭环的固定仪式，即使无工具调用/usage 也显示（tokens 显示 null)。（「设计决策与权衡」L142)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 4. **动画/音效数值照规格原样提取**:……（封存带 0.65s + EOL 0.9s×2……)：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

---

### 11. 凝结雨轨（TurnRail / 闭环凝 ◆) ✅ 已迁移

> 2026-08-27 落地:`renderer/src/ui/TurnRail.tsx`(26px 左轨 2 列迷你雨:11px Matrix Code、行距 12、步进 0.8、8% 亮头、destination-out 0.14、节流 `90/fx.speed` 只读 import `renderer/src/app/ambient-fx.ts` 的 fx,不进 React 渲染路径);闭环凝 ◆(sealIn 0.5s),reduced-motion 一帧静态;`ChatView.tsx` 按节点流分组(user 类开新回合,后续非 user 节点包 `.turn-agent[ is-active][ historical]`,纯加法包裹);样式 `renderer/src/styles/chat.css`;demo 与截图:`ui-prototype/conversation/`。

**精确定位**
- 组件：`src/renderer/src/components/TurnRail.tsx`(:61 `90 / fx.speed` 帧节流；:76-77 活动态 canvas / 闭环 `.seal` ◆ 替身）
- 样式：`src/renderer/src/styles.css:535-556`（回合容器 + 凝结雨轨段；`.rail` :542-549、`.seal` :550-555)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> **凝结雨轨**(TurnRail.tsx)：活动回合左侧 `.rail`(`pointer-events: none`——纯装饰轨道，不拦截拖选/点击）内 2 列迷你数字雨 canvas，帧节流 `90/fx.speed`（与背景雨同一折算，直接读 `fx`)；回合闭环后组件卸载 canvas、凝为 ◆(`.seal`,rAF 立即停——长会话零常驻开销）;reduced-motion 只画一帧静态雨；`aria-hidden`，纯装饰不承载业务（见 CONTEXT.md「凝结雨轨」)。(3.6C 磁带纹变体曾落地，已退回本形态——原型存档 `ui-demo/agent-reply-rail-proto.html`。)（「架构与主要流程」L44)

> - **凝结雨轨零常驻**：闭环即卸载 canvas、停 rAF，长会话不叠加常驻动画开销；◆ 是卸载后的静态替身。（「设计决策与权衡」L146)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 1. **FX 不进 React 渲染路径**：氛围组件与雨轨（RainCanvas / TurnRail）直接 `import { fx } from '../store'` 读取 speed/energy(`90/fx.speed` 帧节流）；不要复制进组件 state，也不要自行插值。（约束 1，摘录首句）

> 4. **动画/音效数值照规格原样提取**(……雨轨 11px 双列）……3.6C 磁带纹已退回迷你数字雨轨，不引用其数值）：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

---

### 12. 字形蛾光标与中断乱码锁定（MothCaret / AbortedMark） ✅ 已迁移

> 2026-08-27 落地:`renderer/src/ui/chat-fx.tsx`——MothCaret(120ms 换 MATRIX_CHARS 字形 + mothblink 1.1s 呼吸、Matrix Code 字体、挂流式 assistant 末文本块);AbortedMark(450ms 逐位锁定、文案 ` [已被操作员中断]`——用户裁决用源仓文案而非官方 message.stopped、danger 色、挂 `data.status==='interrupted'` 末文本块,复刻此前缺失中断标记,本次补齐);样式 `renderer/src/styles/chat.css`。

**精确定位**
- 组件：`src/renderer/src/components/Feed.tsx`(:28 `MothCaret` 字形蛾流式光标；:48 `AbortedMark` 中断乱码锁定）
- 样式：`src/renderer/src/styles.css:525-534`（字形蛾 `.caret` 段，:527);:521(`.aborted` 中断标记色）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> 中断标记 `[已被操作员中断]` 乱码逐位锁定入场、落最后一个 text 段；流式光标 = 字形蛾 MothCaret，落末 entry。（「架构与主要流程」L40，摘录相邻两个子句）

> （Matrix Code 字体）canvas 专用 + 两个 DOM 例外（字形蛾光标 `.caret`、注入解码乱码帧 `.decoding`)（src/renderer/AGENTS.md 关键入口 styles.css 行，L24)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 4. **动画/音效数值照规格原样提取**:……（字形蛾 120ms 换字形 + 1.1s 呼吸、中断乱码锁定 450ms……)：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

---

### 13. 输入栏：微簇状态条 + 输入行 + 命令面板（InputBar / .micro / .palette) ✅ 已迁移

> 2026-08-21 落地:`renderer/src/ui/InputBar.tsx`(+ 微簇 .micro 单行、输入盒 .input-box/.input-row、命令面板;TodoDock/GoalBar/QueueDock 入 dock 排);demo 与截图:`ui-prototype/input-bar/`。

**精确定位**
- 组件：`src/renderer/src/components/InputBar.tsx`(:204 `.palette` 命令面板 listbox;:227 `.micro` 微簇状态条）
- 样式：`src/renderer/src/styles.css:456-474`（微簇状态条段；`.micro` :457、ctx 胶囊条 :461-464、思考强度阶梯 :465-474);:710-745（输入区段，`.inputbar` :711);:746-776（命令面板段，`.palette` :747)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - 区3 对话区 `.console`:`#feed` + `.inputbar`（顶部微簇状态条 `.micro`:◆ 会话标题 + 模型 / ctx 占用条+百分比 / 思考强度 / 状态，缺数据显示 `--`)（「架构与主要流程」L17)

> **命令面板**(InputBar 本地 state，不入 store;`.palette` 上弹式锚定 `.inputbar`):
> - 数据：mount 预取一次 `window.zion.listCommands()`(`CommandItem[]`；主进程 `zion:list-commands` 聚合扫描 skills+命令，数据源 `skillscan.mjs` 属主进程模块）；失败静默 → 空面板。
> - 开合：输入以 `/` 开头且 ≤48 字符时打开；Esc 仅关闭面板（不清输入）。
> - 过滤/排序：`name` startsWith 或 includes（不区分大小写）;command 优先 + `localeCompare` 字母序。
> - 行交互：`role="listbox"/option` + `aria-selected`;↑↓ 循环移动、`onMouseEnter` 同步 active、`onMouseDown` preventDefault 防点击丢焦点；空态 `palette-empty`「无匹配 skill / 命令」。（「架构与主要流程」L67-73，摘录数据/开合/过滤/行交互四条）

> - **command 优先 + 字母序**：面板 max-height 320px 截断时命令恒在可见区（命令少、skills 多），字母序给稳定预期。（「设计决策与权衡」L137)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 11. **`/clear` 仅本地清视图**(store.reset，不触碰主进程会话）；其余 `/cmd` 输入一律走 `window.zion.runCommand`——渲染层只路由不实现命令（执行语义归主进程 dispatch;`/cmd` 匹配规则、结果处理与插入/回填规则见 `DESIGN.md`「架构与主要流程」命令面板）；快捷按钮与 skill 模板文本原样走 `window.zion.prompt`。（约束 11)

---

### 14. 弹层家族与角标（ZionModal / AskDialog / toast / ProjectPanel / .corner)

**精确定位**
- 组件：`src/renderer/src/components/ZionModal.tsx`(:34 `.zion-modal-mask`);`src/renderer/src/components/AskDialog.tsx`(:34 `.ask-mask`;:103 `ToastHost`);`src/renderer/src/components/ProjectPanel.tsx`(:95 复用 `.ask-mask`);另有 `ModelPicker.tsx` / `SettingsPanel.tsx` / `HotkeysPanel.tsx`（内容面板）
- 样式：`src/renderer/src/styles.css:622-629`（共享对角角标 `.corner`);:836-898(AskDialog + toast 段，`.ask-mask` :837、`.toast-host` :874、`.toast` :878-897);:899-920（项目选择面板段）;:921-1014(ZionModal 段：`.zion-modal-mask` :922、一次性扫描线 :944、模型选择器 :970-989、设置面板 :990-1004、快捷键速查 :1005-1014)

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - 壳层 ZionModal：遮罩点击关闭（面板 stopPropagation 防误关）、Esc 关闭（window capture 监听 + stopPropagation，优先于其他 keydown)、挂载即聚焦面板（`tabIndex=-1`）作初始焦点；视觉 v4 底子 + 轻装饰（glow 边框、`▚▞` 角标、打开时一次扫描线扫过 `.zion-modal-scan`，非常驻 CRT)。（「架构与主要流程」弹层基础设施，L79)

> - toast 渲染（`.toast-host` fixed 右下 14px,z-index 85 低于遮罩）:`.toast` 入场 `toast-in` 0.25s 自下而上滑入 + 淡入，3s 后 `toast-out` 0.3s 淡出（`forwards`)——与 store 3.3s 移除 DOM 对齐；`type` 只改左边框色（默认/ok 绿、warning 黄、error 红）。（「架构与主要流程」扩展 UI 桥管线，L87)

> - **对角角标共享 `.corner` 类**(styles.css):trace/diff/ask-dialog/project-panel 四组件的 8×8 对角角标伪元素收敛为单一 `.corner::before/::after` 规则，组件 JSX 只加 `corner` 类名——新组件要角标只加类名，不复制伪元素块；`.trace`/`.diff` 自身仍需 `position: relative`（类名不复位定位）。（「设计决策与权衡」L130)

> - **项目面板复用 `.ask-mask` 遮罩**：与 AskDialog 同一模态遮罩类（z-index 90，见 AGENTS.md 硬约束 6)；无互斥逻辑，同时打开时按 DOM 序叠加（ProjectPanel 挂载于 AskDialog 之后，遮罩在上）。（「设计决策与权衡」L151)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 13. **弹层应答必须成对**:AskDialog 的 `answer()` 同时执行 `window.zion.uiAnswer(ask.id, result)` 与 `setUiAsk(null)`——只清 state 不应答，主进程 Promise 表条目会挂到超时兜底才继续（机制见 `DESIGN.md`「设计决策与权衡」)。（约束 13)

> 21. **模态弹层与全局快捷键纪律**：弹层只经 store 单槽 `openModal(kind, data?)` 开关（同一时刻至多一个、新开自动关旧；ModelPicker 切换成功、Esc、遮罩、✕ 一律回 `openModal(null)`)；弹层类命令由 runCommand 结果 `data.open` 数据驱动打开、载荷随附，**不要在组件里按命令名自判弹层**；全局快捷键常量只放 `hotkeys.ts`(`ZION_HOTKEYS`)——注册（App.tsx `useGlobalHotkeys`）与速查（HotkeysPanel）必须同源，新增/修改快捷键两处联动；`modal` 非空时全局快捷键整体豁免。（约束 21)

> 6. **z-index 分层不可破坏**:……`.toast-host`=85(toast 须低于对话框遮罩）;`.ask-mask`=90（扩展对话框与项目面板共用的模态遮罩）;`.zion-modal-mask`=92(ZionModal 遮罩，须高于一切——高于 `.ask-mask`=90 与 `.toast-host`=85)。（约束 6，摘录与本块相关子句）

---

### 15. 日志抽屉与状态栏（LogDrawer / #term)

> 2026-08-27 决策:**不落地**。经用户裁决:日志抽屉+日志按钮【删除】、SND 开关【删除,音效块 17 未迁】、DEC 开关【删除,注入解码常开】、TLS 1.3/uptime 装饰【删除,R4 不伪造遥测】;纯展示状态栏(连接+tokens+状态字)用户决定亦不落地——复刻顶栏 badge 已承载连接状态、composer StatsLine 已承载 tokens,状态栏属重复信息面。本块仅留此决策记录,不打迁移勾。

**精确定位**
- 组件：`src/renderer/src/components/LogDrawer.tsx`(:17 `.term-head`)
- 样式：`src/renderer/src/styles.css:777-798`（日志抽屉段，`.term` :778、`.term.open` :784);:799-814（状态栏段，`.statusbar` :800);:815-817(`max-width: 900px` 时隐藏侧栏）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - 区4 `.term` 日志抽屉（默认 height:0，展开 150px）+ `.statusbar`(26px,SND 开关 / DEC 开关 / 日志按钮 / `tokens:` 真实 usage 计数）（「架构与主要流程」L18)

> - **日志前端自收集**:`store.logs` 上限 120 行（LOG_MAX),`role="log"`，收起时 `aria-hidden`。（「设计决策与权衡」L133)

> - **状态栏 token 计数 = 真实 usage**:`turn_end` 的 `usage.totalTokens` 经 `addUsage` 累积（v4 的「delta 字符数 ×2」伪计数已删除）;`applySession`/`reset` 归零。（「设计决策与权衡」L123，摘录首句）

> - 状态栏「TLS 1.3」为硬编码装饰，非真实数据（「已知限制与技术债」L202，摘录首句）

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 9. **SND 持久化键 `zion.snd`**(localStorage,`'0'`=关，默认开）;AudioContext 必须经 `useSoundFx` 首次手势解锁，否则被浏览器策略静音。（约束 9；状态栏 SND/DEC 开关另见约束 16)

---

### 16. 字体与字形资产（三个 @font-face / matrixGlyphs.ts / assets/fonts) ✅ 已迁移

> 2026-08-23 落地:三个字体文件入 `renderer/src/assets/fonts/`,`@font-face` ×3 在 `renderer/src/styles/tokens.css` 顶部;`matrixGlyphs.ts`(MATRIX_CHARS 单一事实源)拷入 `renderer/src/`;body 全局字体切 Matrix 回退链(`--m-font`)。

**精确定位**
- 样式：`src/renderer/src/styles.css:1-26`（顶部注释 + 三个 `@font-face`,:6 / :13 / :20);:41(`--font` 回退链）
- 字符集：`src/renderer/src/matrixGlyphs.ts:4`(`MATRIX_CHARS` 单一事实源）
- 素材：`src/renderer/src/assets/fonts/ShareTechMono-Regular.woff2`(latin 子集）、`SarasaTermSC-Regular.subset.woff2`(GB2312 子集 CJK)、`Matrix-Code.ttf`（电影雨字形）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - **本地字体替代 Google Fonts**:styles.css 顶部 `@font-face` 引入 `assets/fonts/ShareTechMono-Regular.woff2`(latin 子集 13.5KB，来源 @fontsource/share-tech-mono,font-display: swap)，替代 demo(index-v4.html）的 Google Fonts `@import`——离线/墙内可用，「离线字体」未做项闭环；`--font` 回退链不变，latin 子集无 CJK，中文文案走系统字体回退。（「设计决策与权衡」L139)

> - 本地字体加载失败：styles.css 顶部 `@font-face` 引用的 `assets/fonts/ShareTechMono-Regular.woff2` 缺失/损坏时，按 `--font` 回退链走 ui-monospace/Courier New；字体声明只在 styles.css 一处，组件一律 `var(--font)`。（「失败模式」L193)

补充（摘自 src/renderer/AGENTS.md 关键入口，非 DESIGN.md):
> - `src/renderer/src/matrixGlyphs.ts` — `MATRIX_CHARS` 单一事实源：Matrix Code 字体 cmap 内的字符全集（全角片假名 34 字 + 数字 012345789[无 6] + `*+<>:|`)；数字雨/雨轨/脑机链路/蠕虫/扰码/注入解码全部从这里取字符，不得各自另写字符集（L14)

> - `src/renderer/src/styles.css` —— 全部设计令牌与布局数值（令牌数值照 `ui-demo/index-v4.html`，勿改；顶部三个本地 `@font-face` 为刻意偏离：Share Tech Mono 拉丁 / Sarasa Term SC GB2312 子集 CJK 回退 / Matrix Code 电影雨字形——canvas 专用 + 两个 DOM 例外（字形蛾光标 `.caret`、注入解码乱码帧 `.decoding`)……)(L24)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 字符集纪律：数字雨/雨轨/脑机链路/蠕虫/扰码/注入解码全部从 `MATRIX_CHARS` 取字符，不得各自另写字符集（关键入口 L14，非编号约束）。

---

### 17. 音效（SoundFx / SND 开关)

视觉宪章含声音语义，本节简收。

**精确定位**
- 组件：`src/renderer/src/components/SoundFx.ts`(:32 `tone()`;:53-81 各音效参数（step/breach/reply/abort 等）;:91 `SND` 单例；:96 `useSoundFx` 首次手势解锁）

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - `tool_execution_end` → `toolEnd`（写 dur、状态 ok/err、尝试 result.patch 升级）；闭环后到达的迟到事件倒序扫回合回退匹配；err → SND.abort,ok → SND.step（「架构与主要流程」事件→状态管线，L32)

> - `agent_end` → `closeTurn()` + READY + SND.reply(replyScheduled 防重复）;`errored` 标记的错误回合不再补 reply 音/「回复完成」日志；`agent_settled` → `closeTurn()` + READY（同上，L34)

> - AudioContext 未解锁：`tone()` 静默 no-op，首次手势后恢复。（「失败模式」L190)

> - SettingsPanel 的 SND 开关只走 `store.setSndOn`(store + localStorage)，不调 `SND.setEnabled`——音频引擎 `enabled` 标志不同步：面板关 SND 后声音仍响（状态栏按钮路径 `setSndOn(SND.toggle())` 是正确的，且 App 只在挂载时 `SND.setEnabled` 一次）；修法：`setSndOn` 内同步或面板改调 `SND.setEnabled`。（「已知限制与技术债」L210，迁移时注意此 bug)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 9. **SND 持久化键 `zion.snd`**(localStorage,`'0'`=关，默认开）;AudioContext 必须经 `useSoundFx` 首次手势解锁，否则被浏览器策略静音。（约束 9)

> 4. **动画/音效数值照规格原样提取**(……SND 7 音参数……)：禁止"优化"数值（ADR 0002)。（约束 4，摘录与本块相关子句）

---

### 18. 横切纪律：设计令牌位置、z-index 分层、reduced-motion 降级、动画数值纪律 ✅ 已迁移

> 2026-08-27 落地:`renderer/src/styles/tokens.css`(全局统一滚动条 6px #00ff66 胶囊 hover #66ff99、::selection rgba(0,255,102,0.22)+白字、:focus-visible outline);`renderer/src/styles/ambient.css` 末位(@media prefers-reduced-motion 全套压平 + 终态补偿,覆盖会话区全部动画类);设计令牌 --m-* 调色板随块 16 已在 tokens.css;动画数值纪律(逐字提取、禁优化)适用于本次落地的全部块。

**精确定位**
- 令牌：`src/renderer/src/styles.css:1`（头注释「令牌照 ui-demo/index-v4.html，勿改数值」);:28-42(`:root` 设计令牌：`--bg`/`--surface`/`--text-*`/`--accent: #00ff41`/`--warning`/`--danger`/`--border`/`--font`)
- z-index 分层：约束 6 数值散见各层（`#rain` :59、`#signal` :708、`.ask-mask` :837 等）
- reduced-motion:`src/renderer/src/styles.css:819-834`(`@media (prefers-reduced-motion: reduce)` 全套压平 + 终态补偿）
- 全局视觉细节：统一滚动条 :475-485；拖选选区 `::selection` :486-494

**视觉设计内容**（摘自 src/renderer/DESIGN.md)
> - **统一滚动条**(styles.css):`*::-webkit-scrollbar` 全局 6px 终端绿胶囊（thumb `#00ff66`/hover `#66ff99`、轨道与角落透明，vision 规格），替代旧 feed/侧栏/term-body 分段 8px 规则——侧栏整栏不滚动，旧 `.sidebar` 规则本就无效；新滚动容器（`.palette`/`.ask-options`/`.pp-list`/`.diff-body` 等）自动同款。（「设计决策与权衡」L128)

> - **选区高亮同终端绿语言**(styles.css 全局 `::selection`):`rgba(0,255,102,0.22)` 半透明绿底 + 白字——不用纯 `#00ff66`（大面积纯色会淹没文字）,0.22 透明度保留识别度且白字可读（styles.css 注释明示）；是 v5 原型（`index-v5.html` 的 `rgba(0,255,65,0.25)`）的收敛版：色相统一到滚动条 thumb 的 `#00ff66` 并补白字。全局生效，组件不另写选区样式。（「设计决策与权衡」L129)

> - REDUCED 分支必须在动画路径早期返回且 done 仍执行（蠕虫直接命中）。（「不变量」L174)

**实现纪律**（摘自 src/renderer/AGENTS.md)
> 4. **动画/音效数值照规格原样提取**(FS=18、拖尾 0.035、`90/fx.speed` 节流、12% 亮头、L 路径 8px 采样、TAIL=18、扰码 620ms、闪烁 900ms、SND 7 音参数、雨轨 11px 双列）;agent 回复重构数值照 `ui-demo/agent-reply-combo-proto.html`（脑波 0.8s/1.6s、烧录 90ms 阶梯封顶 30 行 + 校验环 1.2s、封存带 0.65s + EOL 0.9s×2、字形蛾 120ms 换字形 + 1.1s 呼吸、中断乱码锁定 450ms、注入解码 `min(700, 240+len*6)`ms;3.6C 磁带纹已退回迷你数字雨轨，不引用其数值）：禁止"优化"数值（ADR 0002)。（约束 4，完整原文）

> 5. **reduced-motion 全套降级**:`REDUCED` 常量在模块加载时求值；数字雨画静态帧、Neo 头像张嘴停静态帧且不脉冲、蠕虫直接命中；新动画必须自带降级分支。（约束 5，完整原文）

> 6. **z-index 分层不可破坏**:`#rain`=-1（恒在 UI 之下）、`#stage`=5、`.scanlines`=40(pointer-events:none)、`#signal`=60(pointer-events:none，蠕虫画布不拦截交互）;`.side-resizer`=20（侧栏拖拽热区，负 margin 伸出两侧，须高于 sidebar/console 内容、低于 `.palette`=30 与 `.scanlines`=40);`.palette`=30（命令面板，须低于 `.scanlines`=40);`.toast-host`=85(toast 须低于对话框遮罩）;`.ask-mask`=90（扩展对话框与项目面板共用的模态遮罩）;`.zion-modal-mask`=92(ZionModal 遮罩，须高于一切——高于 `.ask-mask`=90 与 `.toast-host`=85)。（约束 6，完整原文）

> 令牌位置：`src/renderer/src/styles.css` —— 全部设计令牌与布局数值（令牌数值照 `ui-demo/index-v4.html`，勿改……)（关键入口 L24，非编号约束）

---

## 数据源覆盖说明

- `src/main/DESIGN.md` 与 `src/main/AGENTS.md` 已通读：**确认无视觉设计内容**。两者全部篇幅为主进程会话管理/IPC/命令 dispatch 契约；唯一与 UI 呈现沾边的是跨模块同步纪律——`src/main/AGENTS.md`「扩展对话框形态三处同步」要求 `uibridge.mjs` 的 ask kind、`protocol.ts` 的 `UiAsk.kind` 与 `AskDialog.tsx` 渲染分支（confirm/input/select）三处一致，属契约纪律而非视觉，未收入正文各节。
- `src/shared/DESIGN.md` 与 `src/shared/AGENTS.md` 已通读：**确认无视觉设计内容**。两者为纯 IPC 类型契约（`ZionAPI`/`UiAsk`/`UiNotify` 等），其中对 AskDialog/toast 的提及均为数据流与失败语义描述，不含任何视觉/动效信息。

## 延伸阅读（源仓，不在本清单摘录范围）

- 根 `CONTEXT.md` —— UI 词汇表（凝结雨轨/脑波褶/机械继电器/烧录显影/封存带/字形蛾光标/注入解码等术语定义）
- `docs/neural-cable-visual.md` —— 会话脑机链路视觉实现事实源（程序化 SVG + 五段握手 + 字符集）
- `ui-demo/agent-reply-ui-handoff.md` —— agent 回复 UI 六块交接（代码位置/样式值/行为时序/自检清单）
- `ui-demo/react/agent-ui-design-spec.md` —— v4 纯文本复刻规格（令牌/算法/mock 替换点）
- `ui-demo/plan/ui-proto-variants.md` —— 七块 21 变体选型归档（采用/退役状态）
- `ui-demo/plan/icon-set-plan.md` —— 细线 SVG 图标套件待实现清单（P0/P1/P2)
- `research/matrix-style-references.md` —— 黑客帝国风格参考调研（数字雨/电影 UI/CRT 还原）
