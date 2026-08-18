# DeepSeek Zion — PROTOTYPE

> **状态：原型（throwaway → 验证用）**。本工程回答的问题：*"Electron 桌面壳直连真实 dsh web，能否达到功能与官方完全一致、UI 原样复刻的效果？"*
> - **UI 层**：未接入 ZION 视觉层。直接加载官方 `dsh web` 页面——像素级一致、功能天然一致。
> - **下一步（已验证后）**：把 ZION 视觉层（DESIGN.md + neural-cable）作为 renderer 覆盖注入，见 `D:\pi-martix-ui-dev\docs\DSH-GUI-技术选项方案.md` 路线 B/D。

## 它做什么

Electron 主进程：
1. 探测 `127.0.0.1:3080`（可用 `--port N` 改）。
2. 若未运行，自动拉起本机 dsh：`dsh --profile web --port N`（Windows 经 PowerShell，隐藏窗口），最多等 60s。
3. 打开标准窗口加载 `http://127.0.0.1:3080` —— 即官方 DeepSeek Harness UI。

因为加载的就是真实 harness 服务器，**功能对等是天然的**：会话管理、对话流式、工具卡片、设置、轨迹…… 全部与浏览器里 `dsh web` 相同。

## 运行要求

- 本机已安装 dsh CLI（`dsh --help` 可用）。
- 需要能连模型服务（沿用你 dsh 的现有配置）。

## 运行

```sh
npm install          # 首次
npm start            # 探测 3080；没跑就拉起 dsh web 再开窗
npm start -- --port 8080   # 换端口
```

> 若你已手动开着 `dsh web`（127.0.0.1:3080），本工具会直接复用、不会双开；关窗时也只杀掉自己拉起的实例，不会动你自己开的 server。

## 结构

```
main.mjs      Electron 主进程：探测端口 / spawn dsh / 开窗
preload.mjs   最小 contextBridge（只暴露平台/版本/端口，不留后门）
package.json  electron + electron-builder
```

## 已知边界（prototype）

- 无托盘/单例锁/自动更新（未做）。
- `file://` 直接加载官方 dist 会因绝对路径资源与 `__DSH_BOOT__` 注入而失效，所以**必须走真实 server**（本工程即如此）。
- 关窗时杀掉自己拉起的 dsh 进程（PowerShell 子进程树已在 Windows 隐藏窗口模式 kill 父进程；如有残留请 `taskkill /IM powershell.exe`——原型不做进程树清理）。
- 无 ZION 视觉层（下一迭代注入）。
