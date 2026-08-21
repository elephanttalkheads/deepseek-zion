# inspector 使用优化报告(AI 代理视角)

> 来源:2026-08-21 InputBar 迁移期间,AI 代理(kimi code)实际使用 inspector 召唤 TodoDock / GoalBar / input-dock 的全过程记录。
> 总体评价:**接口形态对 AI 友好(CLI 单行命令 + 结构化输出 + 截图路径),一次成功率高的部分值得保持**;以下按影响排序列出可优化点。

## P0 — 影响任务完成的硬问题

### 1. 孤儿 electron 占口,重启链路脆弱(已部分缓解)

- **现象**:杀 npm 包装进程(Ctrl+C / 任务管理器只杀到 npm)会留下孤立 electron 实例,继续占用 5198 控制口和磁盘缓存;新实例面板注入成功但控制口 `EADDRINUSE`,且 cli 全部打到旧实例上,表现为"配方存在却报错/面板神秘失踪"。磁盘缓存也会报 `拒绝访问`。
- **已做**:README「注意」补了重启坑与清理命令。
- **建议**(任选其一):
  1. 主进程加**单实例锁**:检测到 5198 已被同名应用占用时,直接复用/接管旧实例(转发命令),而不是带病启动;
  2. 控制口启动失败时**随机退避端口**并在 status 输出中报告实际端口;
  3. cli 增加 `kill` 子命令:`taskkill /F /T` 所有 `electron --inspector` 进程树,一条命令清场。

### 2. 配方热更新不可靠

- **现象**:改 `recipes.js` 后,`eval location.reload()` 触发的主进程重注入不稳定(实测 reload 后 `window.__zionInspector` 缺失,`recipe` 命令报 `Cannot read properties of undefined`),只能整体重启 Electron。
- **建议**:cli 增加 `reload` 子命令,走主进程显式的「销毁面板 → 重新读取 recipes.js → 重注入」路径,而不是依赖页面 reload 的副作用;或在 README 明确「改 recipes.js 必须重启 app」并给 `reload` 语义兜底。

### 3. 舞台(overlay)截图偶发全黑

- **现象**:`summon goal-bar --shot`(进行态)截图几乎全黑,内容不可读;同配方 paused/blocked 两态正常。
- **推测**:capturePage 早于舞台首帧绘制完成,或舞台被页面遮罩盖住。
- **建议**:截图前 `requestAnimationFrame` 对齐 + 固定小延时;拍后做亮度/方差自检,疑似空帧自动重拍一次并在输出中标注 `retried`。

## P1 — 影响效率的工作流缺口

### 4. 启动无就绪信号

- **现象**:从 `npm run start:inspector:fixture` 到 5198 可达约 40s,期间 `cli status` 只有 `fetch failed`,只能手写轮询循环。
- **建议**:`cli status --wait [--timeout 60s]` 阻塞至就绪;或启动脚本在打口后输出一行机器可读的 `INSPECTOR_READY`。

### 5. 可展开组件缺「展开态」配方(已补齐一个)

- **现象**:官方 TodoPanel 的条形态点击 chevron 会展开任务列表(向上展开 38→150px),原配方只有收起态。已新增 `todo-dock-expanded`(带 `aria-expanded` 幂等检查)。
- **建议**:① 清单(manifest)中给「有展开/收起、多态」的组件打 `states:` 标记,配方按状态成对提供;② 把「幂等状态检查后再点击」抽成 core 辅助(如 `core.ensureExpanded(el)`),避免每个配方手写。

### 6. 「探索 → 固化」工作流值得文档化

- **现象**:本次最高效的路径是:`eval` 探 DOM(发现 strip 本体是 `button[aria-expanded]`)→ `eval` 点击验证 → 再写死成配方。README 目前只写了「探导出 → raw 舞台 / 真实配方」,没写 DOM 交互探索这条线。
- **建议**:README 的「通用流程」补一节:真实配方的探索套路(eval 查选择器/aria 属性 → eval 驱动 → 固化进 recipes.js),并推荐优先使用 `aria-*` / `data-testid` 选择器,避免 class hash(如 `lXshSW_header`)随构建漂移。

## P2 — 体验细节

7. **输出信息已经很实用**(`count:2` 让我不看图就知道 QueueDock 缺席),建议再进一步:`--shot` 输出里带图片尺寸与均值亮度,便于 AI 快速判读截图是否有效。
8. **磁盘缓存报错噪音**:多实例共用 user-data 目录时刷 `Unable to move the cache: 拒绝访问`,可给窗口进程独立临时 userData 目录,或日志里降权为 warning。
9. **fixture 内测声明弹窗**的移除逻辑目前依赖文本匹配,官方改文案时会静默失效;建议给 dev 注入加 `data-inspector-dismiss` 之类的稳定钩子(如果官方 UI 允许加 testid 更好)。

## 附:本轮验证过的可靠用法

```sh
# 干净启动(先清孤儿,再等就绪)
taskkill //F //T //PID <旧 electron --inspector>   # 若有
npm run start:inspector:fixture -- --hidden
node inspector/cli.mjs status                       # 轮询至 ok:true
# DOM 探索 → 固化配方
node inspector/cli.mjs eval "(()=>{const el=document.querySelector('[data-testid=\"todo-panel\"]');return el.outerHTML.slice(0,500)})()"
node inspector/cli.mjs recipe todo-dock-expanded --shot
```
