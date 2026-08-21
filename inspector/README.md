# inspector — 官方 UI 组件召唤器

让 AI(或人)在**官方原版 dsh web 应用**(`npm run start` 那套官方 3080 UI)里,**直接呼出任意官方 UI 组件的真实运行状态**并截图,不再只靠 `docs/ui-component-inventory.md` 的文字描述。

## 原理

官方 dsh web 页面在 boot 后暴露两个全局对象:

- `window.__DSH_BOOT__` — 主机注入的 client 入口图(`{rev, entries:[{id,url,rev}]}`);
- `window.__DSH_MODULES__` — **客户端模块系统**(`ClientModuleSystem`),页面内可 `await window.__DSH_MODULES__.import('<包名>', '', {})` 动态 import 任意官方 client 模块,拿到**真实组件**(模块物化时其 CSS 自动注入);`react` / `react-dom/client` 也在静态种子表里,所以可以用官方同款 React 实例把组件挂到悬浮舞台上。

两种召唤形态:

| 形态 | 说明 | 适用 |
|---|---|---|
| **舞台(overlay)** | 动态 import 官方模块 → 真实组件 + mock props 挂载到悬浮舞台(带标题栏/关闭/截图) | 模块**导出值**的组件(如 `@deepseek-ai/dsh-client-ui-goal` 导出 `GoalBar`/`GoalDock`) |
| **真实(real)** | 驱动官方 UI 真实状态(如向 composer 键入 `/goal …`、选中 fx-alpha 会话、驳回常驻审批) | 任何组件,包括**未从模块导出**的(如 `TodoDock`/`TodoPanel`、`JobListAction` 只有 `apply/inject`) |

未导出组件无法舞台挂载 → 只能靠真实配方(或在真实后端跑出对应状态)。

## 启动

```sh
npm run start:inspector          # 官方 3080 真实后端 + 召唤器
npm run start:inspector:fixture  # 官方 3080 页面 ?fixture(内置假后端,真实配方零副作用)
npm run start:inspector:fixture -- --hidden   # 屏外窗口(适合 AI 无头验收,截图仍可用)
```

启动后:

- 页面右下角出现 **「⿻ 组件」** 悬浮按钮 → 打开面板(搜索清单条目 / 舞台 / 真实 / 原始召唤 / 全窗截图);
- 本地控制口 **`http://127.0.0.1:5198`**(仅回环;`--hidden` 下窗口在屏外,`capturePage` 仍正常)。

## AI 用法(CLI)

```sh
node inspector/cli.mjs status [--wait] [--timeout 60]    # 状态(--wait 阻塞至就绪,启动约 40s)
node inspector/cli.mjs reload                         # 重载配方/面板(改 recipes.js 后不必重启)
node inspector/cli.mjs kill                           # 清场:杀掉所有 electron --inspector 进程树
node inspector/cli.mjs list [--filter xxx]          # 清单(来自 ui-component-inventory.md)
node inspector/cli.mjs summon goal-bar --shot       # 舞台:GoalBar 进行中态 + 截图
node inspector/cli.mjs summon goal-bar-paused --shot
node inspector/cli.mjs summon goal-bar-blocked --shot
node inspector/cli.mjs recipe goal-bar-real --shot  # 真实:/goal 命令 → 真实 GoalBar
node inspector/cli.mjs recipe todo-dock --shot      # 真实:TodoDock plan strip(fixture 的 fx-alpha)
node inspector/cli.mjs raw <module> <component> --props '{"…":…}' --shot   # 原始舞台(纯 JSON props)
node inspector/cli.mjs eval '<js 表达式>'           # 页内任意 JS(返回 JSON 安全值)—— 探导出、自发现
node inspector/cli.mjs shot [--selector '.sel'] [--name n]   # 全窗/选区截图
node inspector/cli.mjs close                        # 关闭舞台
```

截图输出到 `inspector/shot-out/<name>.png`(已 gitignore),AI 可直接读取查看组件真实样子。`--shot` 输出带图片**尺寸 + 亮度均值 + 是否重拍**(`(1072x80, 亮度 183)`),亮度过低说明抓到黑帧/旧帧(已自动重拍一次并标注 `retried`),AI 可据此快速判读截图有效性,不必先开图。

### 通用流程(新组件)

1. `list --filter <名字>` 找清单条目;
2. `eval` 探导出:`Object.keys(await window.__DSH_MODULES__.import('@deepseek-ai/dsh-client-ui-xxx','',{}))`;
3. 有导出 → `raw` 舞台挂载(纯 JSON props;需要函数 props 的组件建议写进 `recipes.js`);
4. 无导出 → 只能真实配方(写 `run()` 驱动官方 UI,参考现有 `goal-bar-real` / `todo-dock`)。

### 真实配方:探索 → 固化(最常用,别跳过)

真实配方先「在页面上摸清组件怎么出现」,再固化成 `run()`。套路:

1. **eval 探 DOM**:找组件本体与稳定选择器,优先 `data-testid` / `data-*` / `aria-*`,**不要用 class hash**(如 `lXshSW_header` 随构建漂移):
   ```sh
   node inspector/cli.mjs eval "(()=>{const el=document.querySelector('[data-testid=\"todo-panel\"]');return el.outerHTML.slice(0,500)})()"
   node inspector/cli.mjs eval "JSON.stringify([...document.querySelectorAll('button[aria-expanded]')].map(b=>b.getAttribute('aria-expanded')))"
   ```
2. **eval 驱动验证**:点按钮、看状态变化(展开/收起、投影出现),确认幂等条件(如 `aria-expanded==='true'` 后不再点):
   ```sh
   node inspector/cli.mjs eval "(()=>{const b=document.querySelector('[data-testid=\"todo-panel\"] button[aria-expanded]');b.click();return 'clicked'})()"
   ```
3. **固化进 recipes.js**:写 `run(core)`,交互一律用 core 助手(`waitFor` / `setNativeValue` / `ensureExpanded` / `dismissComposerTakeover` 套路),幂等检查抽到 `core.ensureExpanded` 这类共享助手,别在配方里手写。
4. **截图验收**:`recipe <id> --shot`,看输出的尺寸/亮度判断是否有效帧。

多态组件在 `manifest.json` 里有 `states` 标记(如 TodoDock: `collapsed`/`expanded`),配方按状态成对提供(`todo-dock` / `todo-dock-expanded`)。

## 配方(recipes.js)

| 配方键 | 形态 | 说明 |
|---|---|---|
| `goal-bar` / `goal-bar-paused` / `goal-bar-blocked` | overlay | 官方 GoalBar 三态(mock props + 官方 zh 词表 `t`) |
| `goal-bar-real` | real | 向 composer 键入 `/goal <目标>` → 官方真实 GoalBar(`data-goal-bar`) |
| `todo-dock` | real | 选中 fx-alpha 会话 + 关掉常驻审批/问题组 → 官方 TodoPanel plan strip(`data-testid="todo-panel"`) |
| `todo-dock-expanded` | real | 同上,再点 strip 头部按钮(`aria-expanded`)→ 官方 TodoPanel **展开态**(任务列表向上展开,150px) |
| `input-dock` | real | **`conversation.input.dock` 槽整区**:真实条目并集截图(TodoPanel 任务条 + GoalBar 目标条 + QueueDock 队列行,`data-queue-dock` 有排队才渲染)—— 即 zion `SlotAnchor` 对应物;社区插件在官方 3080 未注册此槽,故无第三方卡片 |
| `goal-dock` | overlay | 官方 **GoalDock**(ui-goal 导出的真实槽条目适配器,mock `useProjection`)—— 展示槽条目收到的 props 契约(投影适配器 + 注入动作 + t) |

真实配方内部自动处理 fixture 环境的两大障碍:

- **「内测声明」弹窗**:fixture 无法持久化确认(保存必失败)→ 点「继续」后仍残留则直接移除该 dialog(dev 工具行为,仅影响本窗口);
- **composer 接管**:fx-alpha 有常驻审批与问题组 → 点「拒绝」/「放弃整组问题」让输入条(含 dock 条)恢复显示。

## manifest 生成

`inspector/manifest.json` 由 `docs/ui-component-inventory.md` 解析生成(条目含 Part A/B/C、挂载、交互入口、tag、curated 官方映射):

```sh
npm run inspector:gen
```

`gen-manifest.mjs` 里的 `OFFICIAL` 表是「清单条目 → 官方 client 模块/组件」的 curated 映射;新增可舞台挂载的组件先核对该模块**确实导出该值**(`eval` 探导出),再补进映射与 `recipes.js`。

## 注意

- **仅 dev 工具**:注入面板 + 5198 控制口(含 `eval` 原始 JS)只在本机回环、`--inspector` 显式开启时可用;不影响 `start` / `start:replica` 的正常运行。
- **`--fixture` 零副作用**;`goal-bar-real` 在**真实后端**会真的创建会话目标(与用户在 UI 里敲 `/goal` 等价),验证完可点清除。
- 舞台挂载不改动官方应用状态;真实配方只走官方自己的 UI 动作(等价人工操作)。
- 页面刷新后召唤面板需重新注入(主进程在 `did-finish-load` 时自动重注入)。
- **重启与占口(已自动处理)**:新实例启动时若发现 5198 已被「旧 inspector 实例」占用(杀 npm 包装进程常见的孤儿 electron),会自动按端口找 PID **杀掉旧进程树并接管**,无需手工清场;若 5198 被非 inspector 占用则退避到 5208/5218/5228,并把实际端口写入 `inspector/.port`(cli 自动读取)。手动清场用 `node inspector/cli.mjs kill`。
- **配方热更新**:改 `recipes.js` / `page-panel.js` / `manifest.json` 后执行 `node inspector/cli.mjs reload` 即可(主进程显式销毁旧面板 → 重新读盘注入),**不必重启 app**;`eval location.reload()` 的重注入不可靠,别再用了。
- 多实例共用 user-data 的缓存噪音已处理:inspector 模式使用独立 cache 目录(按 fixture/real 区分)。
