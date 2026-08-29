# 02 — 「TUI × Matrix × 极简」灵感候选调研

> 记录日期:2026-08-22。为 deepseek-zion 新视觉规范(TUI 参照 claude code / kimi code + Matrix + 极简)搜集可借鉴的作品与设计语言,收敛为可逐条做微 demo 的候选清单。
> 兼容前提(不可推翻):数字雨背景(磷光绿 `#3dff8f`、黑场 `#010a04`、拖尾长、大留白)、6px 终端绿胶囊滚动条(`#00ff66`)、输入栏形态(`❯` 提示符、发丝线分隔、微簇状态条)。

## 收录纪律(先于一切)

凡违背以下任一条的灵感**直接不收录**:同屏运动源 >1(数字雨已是那个 1,其余动画必须让位或与其同源);卡片式阴影/圆角/多层堆叠;用多色而非单色磷光亮度分层表达层次;装饰性动效(视差、呼吸灯、渐变流转)。

---

## 1. Claude Code / Kimi Code 终端 UI(主锚)

**是什么**:两个 AI coding agent 的交互式 TUI。结构同为「对话流 + 输入框 + 状态条」三段式;Claude Code 偏暖色个性(陶土橙),Kimi Code 更克制(模式切换时输入框边框变色:shell 模式变紫)。我们偷的是**组织方式与密度**,不是配色。

可偷的设计语言:

- **节点前缀符号体系**:用户消息用 `❯` 前缀 + 灰底 surface,AI 正文无前缀纯白(可读性优先),工具结果用缩进 continuation 符号(如 `⎿`)挂在工具行下——符号即信息层级,不用卡片。→ 对话流。
- **镜像循环 spinner**:帧序列 `· ✢ ✳ ✶ ✻ ✽` 走到头再倒放回来(120ms/帧),配一个随机动词("Percolating…")——单字符动画,同屏只有它在动。→ 对话流/工具卡运行态。
- **工具调用块 = 单行框线 + 标题嵌边框**:`┌─ Bash ──────┐` 框线字符画出边界,工具名直接嵌在顶边里,不加图标不加底色块;框线颜色按语义区分(bash 一种、权限一种)。→ 工具卡。
- **权限审批 = 编号选项**:`[1] Yes [2] Yes, and don't ask again [3] No`,数字键直选,选项内关键字母加粗;框线颜色与工具块区分(Claude 用薰衣草紫,我们应改为磷光绿高亮档)。→ 弹层/审批。
- **状态条一行流**:`Opus · 12.4K tokens · $0.04 · 3.2s`,全部 muted 色、`·` 分隔、持久钉在底部——信息与微簇状态条形态完全同构。→ 输入栏微簇(已定锚点,此为佐证)。
- **模式 = 边框变色而非面板重组**:Kimi 的 shell 模式只把输入框提示符换成 `!`、边框换色,布局零改动——模式感知成本极低。→ 输入栏(plan/shell/yolo 态可用框线亮度档区分)。
- **配色克制**:AI 正文绝不上色(白=信任与可读),颜色只给状态与边界;我们的等价物=正文用磷光绿 100% 档,状态用亮度档+字形。→ 全局。

来源:[awesome-tui-design / claude-code DESIGN.md](https://github.com/cola-runner/awesome-tui-design)(源码级考证:字符、色值、帧率均可溯源);[Kimi Code 官方文档 · Interaction and input](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/interaction.html);[Claude Code spinner 定制 issue](https://github.com/anthropics/claude-code/issues/66284)。

## 2. Warp / Zed(暗色工具型产品的密度控制)

**是什么**:Warp 是块式终端(Rust,GPU 加速),Zed 是极简高性能编辑器。二者代表「暗色工具不堆卡片也能有层次」的做法。

可偷的设计语言:

- **Block = 命令+输出的离散单元**(Warp 核心创新):每个回合自成一块,块间一条发丝分隔,块级操作(复制/分享/重跑)只在 hover 时出现——分组不依赖卡片背景,依赖留白+分隔线+隐现操作。→ 对话流(一轮 user→assistant→tools 可视为一个 block)。
- **选中态 = 反色一条**:Warp/Zed 的列表选中是单行反色(前景背景互换),不是加边框、不是左侧色条——最强对比、零额外占地。→ 侧栏会话列表/队列行。
- **4px 栅格 + 发丝分隔**(Zed):所有间距走 4px 倍数,分区只用 1px 低透明度分隔线,无阴影无圆角;密度靠字号字重区分,不靠色块。→ 全局。
- **状态呈现原位更新**(Zed/btop 同源):状态值在原位原地刷新,不弹不闪——变化本身即反馈,不需要动效。→ 微簇状态条/队列计数。

来源:[Warp docs · Blocks](https://docs.warp.dev/terminal/blocks/)、[How Warp Works](https://www.warp.dev/blog/how-warp-works)、[awesome-claude-design / warp.md](https://github.com/rohitg00/awesome-claude-design/blob/main/design-md/terminal/warp.md)、[Zed docs · Appearance](https://zed.dev/docs/appearance)。

## 3. eDEX-UI(全屏操作台;只取与极简兼容的部分)

**是什么**:TRON Legacy 启发的全屏终端+系统监视器(Electron),已停更。主终端居中,四周贴边排布系统信息、文件目录、网络地球、屏幕键盘。**它大部分东西(地球、波形图、音效)都违背极简,不取。**

可偷的设计语言:

- **贴边信息簇**:辅助信息压到屏幕四边、紧贴边缘、字号降一档,中心视野全部留给主任务——「主舞台 + 边缘仪表盘」的分区法。→ 全局布局(侧栏/dock 的视觉权重)。
- **零隙网格拼版**:模块间零间距、共享发丝边框,像拼版而非卡片堆叠——密集但不乱,因为没有透视深度。→ 全局布局(三栏 + dock 的接缝处理)。
- **实时数据的静态容器**:数据在固定框内原地刷新,容器本身纹丝不动——画面「活」在数据里,不活在容器上。→ 队列/微簇。

不取(记录在案):3D 地球、波形频谱、开机音效、键盘可视化——全是第二运动源与装饰。

来源:[GitSquared/edex-ui](https://github.com/GitSquared/edex-ui)、[It's FOSS · eDEX-UI](https://itsfoss.com/edex-ui-sci-fi-terminal/)。

## 4. cool-retro-term(CRT 材质;只取单层静态效果)

**是什么**:拟真 CRT 终端模拟器(QML),效果菜单包括扫描线、磷光辉光、屏幕曲率、抖动、闪烁、烧屏残影、环境光晕。

可偷的设计语言(白名单):

- **静态扫描线**:1px 深色横线、3–5% 不透明度、与行高对齐、**完全静止**——单层叠加即出 CRT 质感,零性能代价。→ 全局(叠加层,需验证与数字雨的相容性,可能只上在对话区)。
- **单层磷光辉光**:仅给主色文字一层小半径同色 text-shadow(如 0 0 6px `#3dff8f` at ~30%)——磷光屏的「光从字里发出来」感;只一层,不叠 bloom。→ 全局(限标题/提示符等少量元素,防性能与糊字)。

黑名单(明确不取):屏幕曲率、字符抖动、闪烁、烧屏拖尾动画、色差——全是持续运动源或损害可读性。

来源:[Swordfish90/cool-retro-term](https://github.com/Swordfish90/cool-retro-term)、[crt-terminal-web(效果清单参考)](https://github.com/chrono000/crt-terminal-web)、[cool-rust-terminal(逐效果枚举)](https://github.com/Aeolun/cool-rust-terminal)。

## 5. HUDS+GUIS / 电影 FUI 的终端类界面

**是什么**:电影/游戏界面参考集散地(HUDS+GUIS、scifiinterfaces.com);终端类 FUI 的高级感几乎全部来自**纯文本 + 框线字符的排版纪律**,而非图形。

可偷的设计语言:

- **角括号聚焦态**:用四个角标 `⌜ ⌝ ⌞ ⌟` 或 `[ ]` 框住当前聚焦/选中项,而不画完整矩形——比全框更轻,FUI 里表示「系统正在注视此处」。→ 弹层/审批聚焦项。
- **框线字符画数据**:表格、进度、结构全用 `─ │ ├ └` 与 `░▒▓█` 表达,不引入任何图形元素——材质统一即高级。→ 工具卡/队列进度。
- **大写小字号标签**:FUI 里系统标签一律 ALL CAPS + 小字号 + 宽字距(letter-spacing),与正文形成「机器声道/人声道」两条音轨。→ 面板标题/分区标签。
- **留白即布景**:好的 FUI 截图里黑场占比极高,元素小而准—— Matrix 感来自空旷,不来自堆满。→ 全局(与已定锚点「大留白」互证)。

来源:[HUDS+GUIS](https://www.hudsandguis.com)、[scifiinterfaces.com](https://scifiinterfaces.com)、[Ghost in the Shell FUI 分析](https://www.hudsandguis.com/home/2017/4/17/ghostintheshell-fui)。

## 6. demoscene / 单色磷光美学

**是什么**:demoscene(Demozoo 存档)与早期单色 CRT(绿磷 P1/琥珀 P3)传统:只有一只磷光粉,层次全靠**同一色相的亮度阶梯**。这也是 ANSI/cracktro 艺术的基本功。

可偷的设计语言:

- **亮度四阶分层**:同一 `#3dff8f` 取 100% / 70% / 40% / 20% 四档不透明度:正文=100,次要=70,辅助/边框=40,水印/装饰=20——层次问题单色内解决,永不引入第二色相(语义色除外,见下)。→ 全局。
- **密度字符渐变**:`░▒▓█` 四个密度级是单色屏的「灰度」,可表达进度、热力、加载——纯字符、零图形。→ 队列进度/工具卡加载。
- **字形即语义**:cracktro 里 `* - + =` 重复排列做分隔与花边,克制地用(单条分隔线)比彩色分隔更有年代质感。→ 对话流分隔(备选,与发丝线二选一 demo 裁决)。
- **语义色最小集**:单色传统里唯一的例外是「告警红」——保留 1 个语义红色(错误/拒绝),其余一切状态(成功/警告/运行)用亮度档+字形(`✓ ! ●`)表达。→ 全局。

来源:[Demozoo](https://demozoo.org)、[Retrocomputing · 单色终端磷光色考](https://retrocomputing.stackexchange.com/questions/12835/)、[Monochrome monitor (Wikipedia)](https://en.wikipedia.org/wiki/Monochrome_monitor)。

## 7. Charm 系 CLI(glow / lazygit / btop)

**是什么**:现代 TUI 三范式——glow(文档渲染,留白与排版)、lazygit(多面板,54k stars)、btop(数据密度,22k stars)。

可偷的设计语言:

- **面板标题嵌进边框**(lazygit):`╭─ Branches ───╮`,标题写在顶边上,外加 `(3)` 计数与右对齐 `1 of 3` 位置指示——标题不占内容行。→ 侧栏面板/队列 dock。
- **单字符状态前缀**(lazygit):文件状态用 `M A D R ?` 单字母前缀着色——信息密度极高,零图标依赖;我们的等价物=会话/队列项的单字符状态(亮度档区分)。→ 侧栏/队列。
- **倒角标题 notch**(btop 签名细节):标题两侧用**反向角** `┐title┌` 嵌进边框,产生「缺口」感——比 lazygit 的直嵌更有机械感,且只多两个字符。→ 工具卡标题/弹层标题(与候选 4 二选一或分层使用)。
- **braille/半块图**(btop):`⣿⣷⣧⡇` 与 `▄ █ ▀` 在字符网格里画出 2×4 分辨率的图——如需 sparkline(如 token 速率),纯字符即可,不引图表库。→ 微簇状态条(可选 demo)。
- **键位提示条**(lazygit/Charm):底部 `[q]uit [space]stage`,键名 `[]` 包裹、说明 muted——可发现性不靠 tooltip。→ 审批弹层/输入栏微簇。
- **glow 的留白纪律**:文档上下留白 + 缩进对齐,证明 TUI 也可以「疏」——支撑我们大留白锚点。→ 对话流。

来源:[awesome-tui-design / lazygit & btop DESIGN.md](https://github.com/cola-runner/awesome-tui-design)、[jesseduffield/lazygit](https://github.com/jesseduffield/lazygit)、[aristocratos/btop](https://github.com/aristocratos/btop)、[charmbracelet/glow](https://github.com/charmbracelet/glow)、[Lazygit 5 周年(TUI 极简性论述)](https://jesseduffield.com/Lazygit-5-Years-On/)。

---

## 8. 候选清单(精选 15 条)

> 每条将单独做微 demo 由用户裁决。色值默认锚点色:主磷光 `#3dff8f`、黑场 `#010a04`、滚动条 `#00ff66`;「亮度档」指对主色取不透明度(100/70/40/20%)。

| # | 候选名 | 描述(具体到字符/色/行为) | 适用区域 | 来源 |
|---|--------|--------------------------|----------|------|
| C01 | 节点前缀符号体系 | 用户消息 `❯` 前缀;AI 正文无前缀 100% 档;工具结果用缩进 `⎿` 挂在父行下。符号承担层级,不用卡片 | 对话流 | Claude Code |
| C02 | 镜像循环 spinner | 帧 `· ✢ ✳ ✶ ✻ ✽` 到头倒放,120ms/帧,70% 档绿,后随一个动词文本;同屏唯一主动画(雨除外) | 对话流/工具卡运行态 | Claude Code |
| C03 | 块光标流尾 | 流式输出尾部跟一个 `▌`(U+258C)块光标,500ms 闪烁,流毕即消失 | 对话流 | Codex CLI/终端传统 |
| C04 | 单行框线工具卡 | `┌─ Bash · npm test ──────┐` 单线框(U+2500 系),40% 档边框,工具名嵌顶边,内部 1 行呼吸padding;无底色无阴影 | 工具卡 | Claude Code |
| C05 | 倒角标题 notch | 标题两侧用反向角 `┐title┌` 嵌进边框线,形成缺口;可与 C04 组合(C04 的框 + C05 的标题写法) | 工具卡/弹层标题 | btop |
| C06 | 发丝消息分隔 | 回合之间一条 `─` 重复发丝线(1px,20% 档),无间距突变;备选同位:`- - -` 虚线 ASCII | 对话流 | Claude Code/Zed |
| C07 | 编号审批选项 | 审批项渲染为 `[1] 允许 [2] 本次会话不再询问 [3] 拒绝`,`[]` 内键名 100% 档加粗、说明 70% 档;Esc=拒绝 | 弹层(审批) | Kimi Code/Claude Code |
| C08 | 反色选中行 | 选中行整行反显(黑字 `#010a04` on `#3dff8f`),非选中行 70% 档;不加边框、不加左侧色条 | 侧栏/队列/一切列表 | Warp/lazygit |
| C09 | 标题嵌边框面板 | 面板标题写进顶发丝线,左对齐 `─ 会话 (12) ─`,右对齐 `1 of 3` 位置;标题不占内容行 | 侧栏/队列 dock | lazygit |
| C10 | Warp block 回合分组 | 一轮 user→assistant→tools 为一个 block;块级操作(复制/重跑)仅 hover 时以 40% 档小字出现在行尾 | 对话流 | Warp |
| C11 | 亮度四阶分层 | 全局限四档:正文 100 / 次要 70 / 边框辅助 40 / 水印 20;层次问题不出单色 | 全局 | demoscene 单色磷光 |
| C12 | 字形状态集 | 状态=字形+亮度而非颜色:运行 `●`100%(可接 C02 spinner)、等待 `◐`70%、空闲 `○`40%、完成 `✓`70%、错误 `✗` 用唯一语义红 | 侧栏/队列/微簇 | k9s/lazygit |
| C13 | 静态扫描线 | 1px 黑线 3–5% 不透明度、与行高对齐、绝对静止;仅叠在对话区,不叠侧栏与弹层 | 对话流(叠加层) | cool-retro-term |
| C14 | 贴边信息簇 + 零隙接缝 | 辅助信息贴窗口边缘、字号降一档;栏与栏之间共享 1px 发丝缝,零间隙零圆角 | 全局布局 | eDEX-UI/lazygit |
| C15 | 角括号聚焦态 | 聚焦/待决项用四角标 `⌜ ⌝ ⌞ ⌟`(或 `[ ]`)框示,不画完整矩形;配合 C08 反色行使用 | 弹层/审批/命令菜单 | 电影 FUI |

## 9. 明确不收录清单(防回流)

- eDEX-UI 的 3D 地球/波形/音效、btop 的多色渐变与 per-panel 彩色边框、Warp 官网的双饱和 accent、Claude Code 的热粉/薰衣草框线色 —— 多色,违背 C11。
- cool-retro-term 的曲率/抖动/闪烁/烧屏 —— 持续运动源,违背「同屏运动源 ≤1」。
- 任何卡片化(圆角+阴影+底色块)承载消息或工具调用 —— 与 C04/C06/C14 直接冲突。
- Charm 式的 Nerd Font 图标依赖 —— 字形集(C12)已够用,引入图标字体是兼容性与视觉噪音双输。
