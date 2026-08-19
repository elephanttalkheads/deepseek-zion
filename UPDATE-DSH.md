# UPDATE-DSH — 手动更新本机 DeepSeek Harness(rc.6 → rc.7)

> **一句话**:本机 dsh 运行时只有**一个物理副本**(靠 SymbolicLink / Junction 层层指向),所以升级 = 一条 `npm install -g @deepseek-ai/dsh@<新版>`;CLI、内嵌依赖链、`.dsh\profiles` 链、deepseek-zion 的 `file:` 引用会**一起自动跟随**到新版。
>
> **与 SYNC.md 的分工**:SYNC.md 讲「官方发布后 deepseek-zion **代码**怎么同步(4 耦合面 / vendor / wire 契约)」;本文件讲「本机 **dsh 运行时安装**怎么升 + 后端怎么重启 + 怎么回滚」。先做本文件(升运行时),再做 SYNC.md §2(同步 zion 仓库)。
>
> **适用**:本机(Windows,DSH_HOME=`C:\Users\zyf\.dsh`,nvm-windows 多版本 Node)。换机见 §8。

---

## 0. 先懂拓扑——为什么只需一步就能全升

```
C:\nvm4w\nodejs  ──SymbolicLink──▶  C:\Users\zyf\AppData\Local\nvm\v24.19.0
                                   └─ node_modules\@deepseek-ai\dsh\        ← 唯一物理 CLI(当前 rc.6)
                                        └─ node_modules\@deepseek-ai\*      ← 内嵌依赖链(195 个 rc.6 包)
                                             ▲
                                              │ Junction 指向这里
C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\*  ← 195 个 rc.6(deepseek-zion 的 file: 引用目标)
```

三个要点:
1. **只要 `npm install -g @deepseek-ai/dsh@<新版>`,`@deepseek-ai/dsh` 的物理目录被原地更新**,其内嵌 `node_modules\@deepseek-ai\*` 整链变成新版。
2. `.dsh\profiles\node_modules\@deepseek-ai\*` 的 **Junction 目标不变**(仍指向上面的内嵌链),所以 profiles 链与 zion 的 `file:` 引用**自动跟随到新版**。
3. **3080 后端正在跑的正是这棵 rc.6 树**(进程命令行 `...\@deepseek-ai\dsh\lib\bin.js web`)——也就是**当前 GUI/会话所在的环境**。重启后端必然中断当前对话;请先抄走要点再动手(§4)。

> 注:哪些路径只是别名、哪一个是物理本体,升级前后都可用 `Get-Item <path> | Select LinkType,Target` 复核。

---

## 1. 前置核实(升级前跑一遍,留证据)

```powershell
# 当前版本(期望 0.1.0-rc.6)
dsh -V        # ⚠️ 版本标志是大写 -V;小写 -v 不是合法选项,会报 "error: --profile <name> is required"

# npm 上最新版本(期望 0.1.0-rc.7 —— 2026-08-17 已发布)
npm view @deepseek-ai/dsh version

# 拓扑确认(应看到 SymbolicLink → C:\Users\zyf\AppData\Local\nvm\v24.19.0)
Get-Item 'C:\nvm4w\nodejs' | Select LinkType,Target

# profile 链 junction 确认(应看到 Junction → ...\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\...)
Get-Item 'C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\dsh-session' | Select LinkType,Target
```

---

## 2. 执行更新(核心一步)

在 PowerShell 执行(**若报权限错误再以管理员运行**):

```powershell
npm install -g @deepseek-ai/dsh@0.1.0-rc.7

# 验证 CLI 版本
dsh -V        # 期望 0.1.0-rc.7
```

> ⚠️ 升级会替换 `...\v24.19.0\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\*` 整条内嵌链为 rc.7。步骤 3 验证 junction 是否仍然跟随。

---

## 3. 验证内嵌链 + junction 已升 rc.7

```powershell
# 抽查几个关键包(都应返回 0.1.0-rc.7)
(Get-Content 'C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-session\package.json' -Raw | ConvertFrom-Json).version
(Get-Content 'C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-host-apiproxy\package.json' -Raw | ConvertFrom-Json).version

# 抽查 profile 链 junction 是否仍生效(应读到 0.1.0-rc.7)
(Get-Content 'C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\dsh-session\package.json' -Raw | ConvertFrom-Json).version

# junction 存在性兜底检查(应为 True;若 False 说明 junction 被破坏,见 §6 重建)
Test-Path 'C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\dsh-session'
```

---

## 4. 重启 3080 后端(**⚠️ 会中断当前 GUI 会话**)

1. 找到并停掉现有后端:
   ```powershell
   Get-NetTCPConnection -LocalPort 3080 -State Listen | Select-Object OwningProcess
   Stop-Process -Id <上面查到的 PID> -Force
   ```
2. 用新版本重启(端口与 trust fence 保持一致;zion 的 `/api` proxy 固定指向 3080):
   ```powershell
   $env:DSH_HOME = 'C:\Users\zyf\.dsh'
   dsh --profile web --port 3080
   ```
3. 浏览器刷新 `http://127.0.0.1:3080` 复验。
   > ⚠️ 重启后**当前这个对话/会话会断开**(后端就是这棵树)。建议:先把本文件与对话要点抄走,重启后用新会话继续。

---

## 5. 同步 deepseek-zion(运行时已升,接着走 SYNC.md)

- 回到 `D:\deepseek-zion` 重跑 `npm install`,让 `file:` 重新解析到 rc.7 的包(`node_modules` 里的链接同步刷新)。
- 按 **SYNC.md §2** 判断 zion 代码要不要动,核心是**面 D wire 契约是否变化**:
  - wire 没变 → 记"已知漂移",暂不升 vendor,`npx vite build` + `npx tsc --noEmit` 自查即可;
  - wire 变了 → 把 `renderer/vendor/` 下 5 个 client 包同步到 rc.7 + 补帧分发/`remote.ts` + 全量探针验证。
- 换机问题与升级无关:zion 的 `file:` 仍是**机器专属绝对路径**,换机继续按 HANDOFF §6 / SYNC §4 处理。

---

## 6. 回滚(升级出问题时)

```powershell
npm install -g @deepseek-ai/dsh@0.1.0-rc.6   # CLI 退回 rc.6,内嵌链随之退回
dsh -V                                        # 期望 0.1.0-rc.6
```

- Junction 目标不变 → 退回后 profiles 链自动回 rc.6。
- 如 `Test-Path '...\dsh-session'` 为 False(junction 被某次 npm 重建破坏),重建:
  ```powershell
  # 例:把 profile 链的 @deepseek-ai 整体重指到新内嵌链
  Remove-Item 'C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai' -Force
  New-Item -ItemType Junction -Path 'C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai' `
    -Target 'C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai'
  ```

---

## 7. 常见坑

- **权限**:`npm install -g` 报 EPERM/存取被拒 → 以管理员 PowerShell 重试。
- **npm 使用的 Node**:`npm prefix -g` 应指向 `C:\nvm4w\nodejs`(它符号链接到 nvm 的 v24.19.0);若实际指向别处,`npm install -g` 会装到另外的树,`dsh -V` 不会变。
- **会话中断**:忘了先抄要点就重启 3080 → 当前对话直接断;按 §4 建议流程先存档。
- **zion 的 `file:` 中 `dsh-llm-retry` 指向"包中包"路径**(`...\dsh\node_modules\@deepseek-ai\dsh-llm-retry`):升级后该路径仍存在但版本变 rc.7;若 zion 编译异常,优先查这条引用。

---

## 8. 换机注意

- 本文件的命令大量使用**本机专属绝对路径**(`C:\nvm4w`、`C:\Users\zyf\AppData\Local\nvm\v24.19.0`、`C:\Users\zyf\.dsh`)。
- 换机时:沿用「先确认 nvm 符号链接 + profiles junction 拓扑,再 `npm install -g @deepseek-ai/dsh@<版本>`」的思路,把路径换成那台机器的实际值即可;拓扑判断方法(`Get-Item ... | Select LinkType,Target`)可移植。

---

## 附录:本次核实的证据快照(2026-08 更新时)

| 项 | 值 |
|---|---|
| 更新前 CLI 版本 | `0.1.0-rc.6` |
| npm latest | `0.1.0-rc.7`(发布 2026-08-17) |
| `C:\nvm4w\nodejs` | SymbolicLink → `C:\Users\zyf\AppData\Local\nvm\v24.19.0` |
| `dsh` 物理位置 | `C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh` |
| `.dsh\profiles\node_modules\@deepseek-ai\*` | Junction → 上述 dsh 内嵌 `node_modules\@deepseek-ai\*`(195 包) |
| 3080 后端进程 | `"C:\nvm4w\nodejs\node.exe" ...\@deepseek-ai\dsh\lib\bin.js web`(即同一棵 rc.6 树) |
| DSH_HOME | `C:\Users\zyf\.dsh` |
| zion `file:` 引用目标 | `C:/Users/zyf/.dsh/profiles/node_modules/@deepseek-ai/*`(经 junction 落到底层 rc.6/rc.7 链) |
