# 本机安装 WSL 并在 WSL 中运行 Agent — 流程清单

> 依据:context7 拉取的 Microsoft 官方 WSL 文档(`/microsoftdocs/wsl`,install.md / basic-commands.md / setup/environment.md),结合本机实测状态生成。
> 生成日期:2026-08-19

## 〇、先纠正一个认知

**模型能力不会因为跑在 WSL 里而变强。** DeepSeek / Kimi 的推理都在云端,本地只是客户端。WSL 的实际收益是:

- Linux 原生的 shell / 文件系统 / 权限模型,agent 执行命令、跑构建、装依赖时坑更少(本项目大量 probe 脚本、Node 工具链在 Linux 下行为更一致);
- 避免 Windows 路径、编码(如本机 PowerShell 输出中文乱码)、进程信号等边角问题;
- 与 Docker / 服务端环境一致。

所以目标是「给 agent 一个更顺手的 Linux 执行环境」,而不是提升模型本身。

## 一、本机现状(已实测)

| 项目 | 状态 |
|---|---|
| 操作系统 | Windows 11 家庭中文版,build 22000(Win11 初代,满足 WSL2 要求) |
| WSL 本体 | **已安装**(随 Docker Desktop 装入),默认版本 WSL 2 |
| 已有发行版 | 仅 `docker-desktop`(Docker 内部专用,**不能当开发环境用**),当前 Stopped |
| 可用的开发发行版 | **无** —— 需要装一个 Ubuntu |

结论:不需要跑完整的 `wsl --install`,只需补装一个 Ubuntu 发行版。

## 二、安装 Ubuntu(WSL2)

以**管理员**身份打开 PowerShell,依次执行:

```powershell
# 1. 确认 WSL2 为默认版本(官方文档:install-manual.md)
wsl --set-default-version 2

# 2. 安装 Ubuntu(官方文档:install.md,wsl --install -d <Distro>)
wsl --install -d Ubuntu

# 3. 装完后确认状态(官方文档:basic-commands.md)
wsl --list --verbose
# 期望看到:Ubuntu  Running/Stopped  2
```

- 首次启动 Ubuntu 会要求创建 Linux 用户名和密码(与 Windows 账号无关,密码输入时不显示,属正常)。
- 若 `wsl --install -d Ubuntu` 报错说组件缺失,再补跑 `wsl --install` 完整安装并**重启**。
- 可选:先用 `wsl --list --online` 查看可安装的发行版列表。

## 三、在 Ubuntu 里准备 agent 运行环境

进入 Ubuntu(开始菜单搜 Ubuntu,或 Windows Terminal 里选 Ubuntu,或 PowerShell 里输 `wsl -d Ubuntu`),然后:

```bash
# 1. 更新系统包
sudo apt update && sudo apt upgrade -y

# 2. 装基础工具
sudo apt install -y curl git build-essential

# 3. 装 Node.js(agent CLI 普遍要求 Node 18+,建议 22 LTS,用 NodeSource 源)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

## 四、在 WSL 中运行 agent

```bash
# 以 Kimi Code CLI 为例(DeepSeek 系/其它 agent CLI 同理)
npm install -g @moonshot-ai/kimi-code   # 或你实际使用的 agent 包
kimi --version

# 登录/配置 API key,然后直接在项目目录启动
cd ~/projects && kimi
```

注意事项:

- **项目文件放在 Linux 文件系统里**(`~/...`),不要放 `/mnt/e/...`。跨系统访问 `/mnt` 下的 Windows 盘文件 IO 慢一个数量级,agent 频繁读写文件时差距明显。可用 `git clone` 把仓库拉进 WSL,或 `cp -r /mnt/e/deepseek-zion ~/projects/`。
- Windows 与 WSL 的凭据/配置文件互相独立,API key 需要在 WSL 里重新配置。
- 网络走 Windows 宿主,若 Windows 侧用了代理,WSL 里可能要单独配置 `http_proxy`/`https_proxy`。

## 五、推荐配套(可选)

- **Windows Terminal**:多标签,直接开 Ubuntu 会话(Microsoft Store 安装)。
- **VS Code + WSL 扩展**:在 Windows 的 VS Code 里编辑 WSL 中的代码,`code .` 即可从 Ubuntu 里唤起。
- `.wslconfig`(放在 Windows 用户目录 `C:\Users\<你>\.wslconfig`)限制内存,避免 WSL 吃满:

```ini
[wsl2]
memory=8GB
processors=4
```

## 六、验收清单

- [ ] `wsl -l -v` 显示 `Ubuntu ... 2`
- [ ] Ubuntu 内 `node -v` ≥ 18,`git --version` 正常
- [ ] agent CLI 在 Ubuntu 内能启动并完成一次对话
- [ ] agent 在 Linux 侧项目目录内能正常读写文件、执行 shell 命令
