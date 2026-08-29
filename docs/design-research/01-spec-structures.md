# 设计规范文档组织结构调研(01-spec-structures)

> 目的:为 deepseek-zion 新 DESIGN.md(TUI + Matrix + 极简,写给 AI 编码代理执行)调研优秀设计规范/设计系统文档的**组织结构**——只研究"怎么组织规则",不研究视觉内容。
> 日期:2026(调研当日);所有事实附来源 URL。

---

## 1. GitHub Primer(primer.style)

### 文档骨架

- 顶层按受众/产物分层:Product UI(产品界面)、Brand toolkit、Brand UI,下面挂 **Shared Foundations**:Accessibility / Octicons / **Primitives(设计令牌:color、spacing、typography)**。来源:[primer.style](https://primer.style/)
- 仓库内文档目录即分层本身:`content/foundations/`、`content/components/`、`content/ui-patterns/`、`content/guides/`。来源:[github.com/primer/design](https://github.com/primer/design)
- 每个组件页固定三个 Tab:**Overview**(实现状态 + 常见用法 + 变体 + API 表)、**Guidelines**(何时用/何时不用、Do/Don't、常见坑、anatomy 解剖图、文案规范、交互行为)、**Accessibility**(键盘导航、触达目标、未解决的无障碍问题也如实列出)。来源:[Primer documentation 贡献指南](https://primer.style/product/contribute/documentation/)
- 组件页 API 用统一三列表:`prop | 默认值 | 类型+说明`,说明里写清行为语义(如 `inactive` 与 `disabled` 的区别和优先级)。来源:[Button 组件页](https://primer.style/components/button)

### 值得偷的写法

1. **「文档写作规范」元规则**:给规范本身定写法——祈使句、肯定句、删副词、禁双重否定、禁 "easy/simply/just"、禁用被动语态回避"你"。这直接适用于写给 AI 代理的规范:每条规则必须是可执行的祈使句。
2. **Do/Don't 用静态图不用活代码**:"我们不希望展示如何 hack 组件来实现 Don't 示例"——反例用描述/截图,正例才可复制。对 AI 代理的推论:禁止清单用纯文字断言,正确示例才给代码。
3. **Minimum-viable documentation**:先保证每条规范"准确、信息充分但简洁、可见",覆盖率优先于深度,信息现成才加深。对应我们「待验证区 → 已定锚点」的渐进沉淀。
4. **发布检查清单**(拼写、链接、敏感信息、alt 文本、他人校对)——规范文档也有验收口径。

### 代表性摘录

> "Write affirmative sentences wherever possible. Use imperative mood… Remove unnecessary words." — [Primer documentation principles](https://primer.style/product/contribute/documentation/)

> Guidelines tab 内容清单:"when to use it and when not to use it / Do/Don't examples / Common pitfalls to avoid / Anatomy diagram"。同上。

---

## 2. Vercel Geist(vercel.com/geist)

### 文档骨架

- 顶层只有 7 个入口,没有叙事章节:Brand Assets / Icons / Components / Colors / Grid / Geist Sans / Geist Mono(Typeface)。极简到"目录即规范"。来源:[Geist Design System](https://vercel.com/geist/introduction)
- Colors 页是纯**语义令牌分层**:先列 10 个色阶(scales),再把每个色阶的 10 个编号按**用途角色**分组定义:
  - Backgrounds:Background 1(默认)/ Background 2(少用)
  - Colors 1–3:组件背景(default / hover / active)
  - Colors 4–6:边框(default / hover / active)
  - Colors 7–8:高对比背景
  - Colors 9–10:文本与图标(secondary / primary,保证可访问对比度)
  来源:[Geist Colors](https://vercel.com/geist/colors)

### 值得偷的写法

1. **编号 + 角色的双层令牌**:色值本身匿名(1–10),语义只来自"角色分组说明"。改主题换整套色阶时,角色定义一行不动——这正是 Matrix 绿/终端暗色多主题场景需要的结构。
2. **每个角色一句话 + 一个真实 UI 截图**,没有理论章节。状态色直接按 default/hover/active 三态成组给出,而不是分散在各组件页。
3. **"少用"也是规则**:"Background 2 should be used sparingly"——用量约束写进令牌定义,不靠读者自觉。

### 代表性摘录

> "Colors 1–3: Component Backgrounds… Color 1 Default background / Color 2 Hover background / Color 3 Active background" — [Geist Colors](https://vercel.com/geist/colors)

---

## 3. Linear Method(linear.app/method)

### 文档骨架

- 全文只有两章:**Principles(8 条)** 和 **Practices(12 条)**。每条 = 一个祈使句标题 + 2–4 句解释,全篇无图、无代码、无附录。来源:[The Linear Method](https://linear.app/method/introduction)
- Principles 是价值观级硬观点("Purpose-built""Say no to busy work""Decide and move on");Practices 是操作级规则("Work in n-week cycles""Keep a manageable backlog""Scope issues to be as small as possible")。

### 值得偷的写法

1. **少而硬**:20 条管一个公司。每条可独立引用、独立反驳,没有"视情况而定"的条款。写给 AI 代理的规范尤其需要这种密度——规则越多,被忽略的越多。
2. **标题即规则,正文即理由**:标题可以单独抽出来当 checklist;正文只回答"为什么"和"做到什么程度"。
3. **价值观与操作分层**:先讲不可协商的取向(Principles),再讲可执行的动作(Practices)——与我们的「不可交换的边界」/「创作指令」分层同构。
4. "Aim for clarity: Don't invent terms… Projects should be called projects." — 不造词本身就是一条规则,对我们「词表纪律」直接可用。

### 代表性摘录

> "Decide and move on — There isn't always a best answer. Sometimes the most important thing is to make a decision, and move on." — [Linear Method](https://linear.app/method/introduction)

---

## 4. Charm / Lip Gloss(charm.sh,github.com/charmbracelet/lipgloss)

### 文档骨架

- README 即完整规范,按**能力域**分节:Colors(色彩模式)→ Inline Formatting(行内格式)→ Block-Level Formatting(padding/margin)→ Aligning → Width/Height → Borders → Copying/Inheritance/Unsetting/Enforcing Rules → 渲染工具(tables/lists/trees/compositing)→ Advanced Color Usage。来源:[Lip Gloss README](https://github.com/charmbracelet/lipgloss)
- 每节固定格式:一句话说清能做什么 → 一段可复制代码 → (必要时)边界行为说明。
- 终端的"设计令牌"= **Style 纯值对象**:声明式链式定义、可复制、可继承(只继承未设置的规则)、可 unset、可强制约束(`Inline`/`MaxWidth`/`MaxHeight`)。

### 值得偷的写法

1. **终端约束是一等公民**:色彩按终端能力分档(ANSI 16 / 256 / TrueColor / 1-bit ASCII),并定义**降级策略**(自动降采样、非 TTY 时剥离 ANSI、自适应明暗色 `LightDark`)。TUI 风格规范必须回答"能力不够时退化成什么",这是 web 设计系统没有的一章。
2. **样式的组合语义写清楚**:复制、继承(仅补未设值)、unset(取消后不再被继承/复制)——令牌怎么叠加、谁覆盖谁,是规范必须显式定义的部分。
3. **"Enforcing Rules" 概念**:组件作者可以给自己的样式施加硬约束(强制单行、限宽限高),防止消费者破坏意图——对应我们规范里"复刻 UI 独占位/插件附加型槽"这类结构性硬边界。
4. 自定义边框用 8 字符结构体(Top/Bottom/Left/Right/四角)——ASCII 美学被精确到字符级定义,Matrix/TUI 风的边框、连接线都应这样枚举。

### 代表性摘录

> "Style definitions for nice terminal layouts… takes an expressive, declarative approach to terminal rendering. Users familiar with CSS will feel at home." — [Lip Gloss README](https://github.com/charmbracelet/lipgloss)

---

## 5. Textual / Ratatui(textual.textualize.io,ratatui.rs)

### 文档骨架

- **Textual**:guide 按概念递进——Styles 一章的顺序是:styles 对象 → Colors(颜色表达法:名称/hex/rgb/hsl + alpha)→ Dimensions/Box Model(width/height/padding/border/margin)→ Units(%,vw/vh,w/h,fr)→ min/max → Border/Outline/box-sizing。每个概念 = 最小可运行示例 + 终端渲染结果图。来源:[Textual Styles guide](https://textual.textualize.io/guide/styles/)
- **Ratatui**:docs 分 Concepts / Recipes / Showcase;样式组织为 `Style` 结构体(fg / bg / modifier 三要素),文本组合为 `Span → Line → Text` 三层;Recipes 是"编号步骤 + 代码 + 渲染结果"的固定三段式。来源:[Ratatui Styling Text recipe](https://ratatui.rs/recipes/render/style-text/)

### 值得偷的写法

1. **概念递进式教学顺序**:颜色 → 盒模型 → 单位 → 边框,后一节只依赖前面已建立的概念。给 AI 代理的规范同样需要显式的"阅读顺序/依赖顺序",不能默认无序。
2. **样式要素的最小闭集**:Ratatui 把全部样式收敛为 fg / bg / modifier(bold/italic/underline…)三类;文本收敛为 Span/Line/Text 三层。**少到能背下来的原语集**是 TUI 美学的根基——我们的规范也应定义"全部视觉效果只允许由 N 个原语组合而成"。
3. **box-sizing / margin 重叠这类陷阱如实写出**(Textual 明确标注 "Margins overlap"),陷阱与规则同页,不集中到附录。
4. Recipe 三段式(步骤 → 代码 → 结果)与我们"每条规范经 demo 验证"的纪律天然对应:规范条目可以引用它对应的 demo/探针产物作为"渲染结果"。

### 代表性摘录

> "`Style` provides a set of methods to apply styling attributes… Foreground and Background Colors (`fg` and `bg`), Modifiers (like `bold`, `italic`, `underline`)." — [Ratatui Styling Text](https://ratatui.rs/recipes/render/style-text/)

---

## 6. 给我们的建议骨架(在既有四章骨架上演进)

现有骨架:**创作指令 / 已定锚点 / 不可交换的边界 / 待验证区**;纪律:每条规范必须经 demo 验证 + 用户确认才能写入。以下建议是**扩展而非推翻**:

1. **四章保留,各章内部引入统一条目格式**(偷 Primer 组件页三 Tab + Linear 标题即规则):
   - 每条规范 = 祈使句标题 + 一句理由 + (可选)Do/Don't 对照 + **验证指针**(demo 路径 / 探针名 / 确认日期)。
   - 验证指针是把"demo 验证+用户确认"纪律嵌进条目本身的机制——无指针的条目不允许存在于「已定锚点」。
2. **「已定锚点」内部按 Geist 式令牌分层组织**(而不是按时间堆积):
   - 第一层 原语(primitives):色阶(匿名编号)、字阶、间距、边框字符集(偷 Lip Gloss 的字符级边框枚举);
   - 第二层 角色(roles):背景1/2、组件背景 default/hover/active、边框三态、文本 primary/secondary——角色引用原语,主题切换只换原语;
   - 第三层 原语闭集声明(偷 Ratatui):全部视觉效果只允许由 N 个原语组合,新增原语本身是待验证区条目。
3. **「创作指令」前置一节「写法元规则」**(偷 Primer documentation principles):祈使句、肯定句、禁双重否定、禁 "easy/just"、每条规则必须可判定(代理读完能回答"这行 CSS 合不合规")。
4. **新增一个常驻小节「终端/TUI 约束与降级策略」**(偷 Lip Gloss,放进「不可交换的边界」或并列第五章):色彩能力分档、暗色优先、非 TTY/低能力环境的退化形态、动效不阻塞主线程(R7 的延伸)。这是 TUI+Matrix 方向相对 web 设计系统必须多出来的一章。
5. **「待验证区」条目也用同一格式,但验证指针为空**,并标注假设来源;晋升到「已定锚点」的动作 = 补验证指针,而不是改写条目——保证演进过程可追溯(对应 Primer 的 minimum-viable documentation:先准确可见,验证后加深)。
6. **总量纪律**(偷 Linear):已定锚点的规则数设软上限(如 ≤30 条);超限时先合并/降级旧条目再新增。规则的可执行密度优先于覆盖面。

骨架一句话总结:**四章不动;锚点章内部改为「原语 → 角色 → 原语闭集」三层令牌结构;所有条目统一「祈使标题 + 理由 + Do/Don't + 验证指针」格式;新增 TUI 降级策略小节;待验证→已定的晋升 = 补验证指针。**
