# DESIGN.md — 项目级视觉设计规范

> 状态:Active / 项目级视觉单一事实源
>
> 风格:**终端(TUI)+ Matrix + 极简**
>
> 沉淀纪律:本文每条内容都经 demo 实践 + 用户确认后写入。第 4 章「待验证区」的候选在确认前不作为执行依据;确认后移入第 2 章。

## 1. 创作指令

**第一命题:界面是一台正在工作的终端,不是套了绿色皮肤的 SaaS。**

Matrix 的辨识度来自黑场、磷光绿、字形与状态叙事,不来自效果堆叠。极简靠**少放元素**达成,不靠全局调淡;信息可以密,但分区必须稳定、边线必须统一、同屏运动源 ≤1。

**TUI 四成分(已裁决的方向,参照系 = claude code / kimi code 一类终端 agent UI):**

1. **全局等宽** — UI 文案、控件、菜单一律等宽字体;中文走字体回退链。
2. **提示符语义** — 输入行以 `❯` 开头;系统输出带前缀/状态符,读起来像终端会话。
3. **框线字符分隔** — 分区用 1px 发丝线与框线字符,不用卡片/阴影/圆角堆叠。
4. **文本即界面** — 状态用文字与符号表达(`READY` / `2x` / `▮▮▮░░ 51%`),图标让位给字符。

外加半条:**焦点态可见** — `:focus-visible` 有明确指示,键盘路径全程可走;但不要求快捷键提示常驻(常驻 hint 抬密度,违背极简)。

**与既有样式的关系**:与本文冲突的既有样式均为待修正,按用户点名的优先级逐个走「demo → 确认 → 落地」重刷,不做一次性全量重写。

## 2. 已定锚点

三个锚点是新规范的种子:已实践、已确认,参数从现有实现**原样提取**固化,改动需经用户确认。

### 2.1 数字雨背景(已落地,形态基准 = 当前实现)

实现:`renderer/src/ui/RainCanvas.tsx` + `renderer/src/styles/ambient.css` + `renderer/src/app/ambient-fx.ts` + `renderer/src/matrixGlyphs.ts`。

- **挂载**:`<canvas id="rain" aria-hidden>`,AppFrame 内第一个子节点;`position: fixed; inset: 0; z-index: -1`,永远排在所有 UI 之下。
- **字符集**:全角片假名 34 字 + 数字 `012345789`(无 6)+ `*+<>:|`,单一事实源 `matrixGlyphs.ts`,不得另写字符集。
- **字形**:字体 `"Matrix Code", "Share Tech Mono", monospace`;字号/列宽 `FS = 18px`;字形横向压缩 `GLYPH_SX = 0.55`(恢复原半角观感,网格不变)。
- **运动**:每帧下落 `FS * 0.9`;帧节流 `90ms / fx.speed`(READY 档 ≈11fps,忙碌档 ≈24fps);拖尾 = 每帧盖 `rgba(1,10,4,0.035)`。
- **色彩**:普通字形 `rgba(61,255,143,0.95)`(磷光绿);12% 亮头 `rgba(220,255,232,1)` + 辉光 `rgba(120,255,175,0.9) blur 8`。
- **呼吸**:速度两档(非连续插值)——READY `{speed:1}` / 忙碌 `{speed:2.2}`,由选中会话 running 快照驱动;FX 状态走模块级对象,**不进 React 渲染路径**。
- **稀疏**:列落出屏底后仅 3.5% 概率重生,保证大块黑色留白。
- **reduced-motion**:只绘制一帧静态雨幕(`rgba(61,255,143,0.6)`,隔列布字),不起 rAF。
- **配套 CRT 扫描线层** `.scanlines`:`fixed; z-index: 40; pointer-events: none`,1px/4px 横向暗纹 `rgba(0,0,0,0.10)`。

### 2.2 全局滚动条(已落地,`renderer/src/styles/tokens.css:103-107`)

```css
*::-webkit-scrollbar { width: 6px; height: 6px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: #00ff66; border-radius: 3px; }
*::-webkit-scrollbar-thumb:hover { background: #66ff99; }
*::-webkit-scrollbar-corner { background: transparent; }
```

6px 终端绿胶囊,轨道/角落透明;通配选择器全局生效,新滚动容器自动同款。

### 2.3 输入栏 InputBar(形态基准 = `ui-prototype/input-bar/input-bar-proto.html`)

结构(自下而上):dock 停靠排(TodoDock / GoalBar / QueueDock / 插件卡)→ 微簇状态条 `.micro`(权限 chip、Plan chip | 模型菜单、ctx 胶囊条+百分比、推理等级、状态)→ 发丝边框输入壳(附件 rail + 输入行:「+」命令、📎 附件、`❯` 提示符、textarea、停止 ✕、发送 ↑)→ 统计条 StatsLine。弹层:命令面板 `.palette`/+ 面板 `.cmd-panel`/模型菜单 `.model-menu`/风险确认 `.risk-mask`/拖放 `.drop-overlay`/灯箱 `.lightbox`。

**设计令牌**(`:root`):

| 令牌 | 值 | 角色 |
|---|---|---|
| `--bg` | `#010a04` | 黑场底 |
| `--surface` / `--surface-2` | `rgba(2,18,9,0.92)` / `rgba(3,26,13,0.94)` | 分区底 |
| `--text-primary` | `#3dff8f` | 主文本(磷光绿) |
| `--text-secondary` / `--text-tertiary` | `#23c468` / `#1da754` | 次级/弱提示 |
| `--accent` | `#00ff41` | 活跃/可交互 |
| `--bright` | `#c2ffd9` | 峰值/焦点(全屏克制使用) |
| `--warning` / `--danger` | `#ffb000` / `#ff5555` | 警告/危险(仅语义位) |
| `--border` | `rgba(61,255,143,0.18)` | 1px 发丝线 |
| `--font` | `"Share Tech Mono", ui-monospace, "Cascadia Mono", "Courier New", "Sarasa Term SC", "Microsoft YaHei", monospace` | 全局等宽 + 中文回退 |

**度量基调**:正文/输入 15px;状态/dock 12px;chip/统计 11px;数字一律 `tabular-nums`;输入框行高 22.5px、5 行封顶;分隔只有 1px `var(--border)` 发丝线,`:focus-within` 底边转 `--accent`;`:focus-visible` outline 1px accent offset 2px。

**z-index 分层**:`#rain` -1 / 面板类 30–35 / `.scanlines` 40 / `.drop-overlay` 80 / `.risk-mask` 85 / `.lightbox` 90。

## 3. 不可交换的边界

风格可以重做,以下边界不因任何风格任务豁免:

- 展示真实事件、任务、文件、耗时和结果。未知数据明确标记为未知,不生成假进度、假 token、假安全结论或假工具调用。
- 对外只呈现可交付的 reasoning 摘要、计划、动作和证据,不暴露隐藏思维链、凭据、系统提示或敏感环境信息。
- 提交、删除、终止、重试、项目切换等关键操作始终有可理解的文字、键盘路径、焦点状态和必要确认。
- 颜色、声音和动画均有语义等价物;主要交互具有正确的原生语义或 ARIA。
- 遵守闪烁安全,提供暂停/静音/reduced-motion 路径:降级直接显示终态,无拉伸、无中间帧闪现,且错误时仍可操作。

## 4. 待验证区

(空)

候选设计语言入区流程:research 精选 → 单元素微 demo → 用户确认 → 综合场景 demo 验证搭配 → 用户肯定 → 移入第 2 章。demo 与验证截图放 `ui-prototype/<主题>/`。
