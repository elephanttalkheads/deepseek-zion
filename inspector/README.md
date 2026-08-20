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
node inspector/cli.mjs status                       # 状态
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

截图输出到 `inspector/shot-out/<name>.png`(已 gitignore),AI 可直接读取查看组件真实样子。

### 通用流程(新组件)

1. `list --filter <名字>` 找清单条目;
2. `eval` 探导出:`Object.keys(await window.__DSH_MODULES__.import('@deepseek-ai/dsh-client-ui-xxx','',{}))`;
3. 有导出 → `raw` 舞台挂载(纯 JSON props;需要函数 props 的组件建议写进 `recipes.js`);
4. 无导出 → 只能真实配方(写 `run()` 驱动官方 UI,参考现有 `goal-bar-real` / `todo-dock`)。

## 配方(recipes.js)

| 配方键 | 形态 | 说明 |
|---|---|---|
| `goal-bar` / `goal-bar-paused` / `goal-bar-blocked` | overlay | 官方 GoalBar 三态(mock props + 官方 zh 词表 `t`) |
| `goal-bar-real` | real | 向 composer 键入 `/goal <目标>` → 官方真实 GoalBar(`data-goal-bar`) |
| `todo-dock` | real | 选中 fx-alpha 会话 + 关掉常驻审批/问题组 → 官方 TodoPanel plan strip(`data-testid="todo-panel"`) |

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
