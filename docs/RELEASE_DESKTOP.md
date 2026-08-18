# DSH Studio Desktop 桌面端安装与发布指南 (Release & User Guide)

> **版本**：v1.0.0  
> **责任角色**：🚀 OPS (DevOps 工程师)  
> **发布状态**：Ready for Release

---

## 1. 平台支持与用户快速开始 (Zero Configuration)

DSH Studio Desktop 是面向 **Windows x64** 和 **macOS Apple Silicon (arm64)** 的现代化桌面客户端，已内置 Node.js、DSH 核心运行时及全套 Studio 插件（MCP 多源管理中心、CoT 视觉引擎、小鲸鱼姬 2.0 桌宠、增强侧边栏），**普通用户无需单独安装 Node.js、pnpm 或配置终端命令**。

| 操作系统平台 | 安装包格式 | 安装与使用方法 |
| :--- | :--- | :--- |
| **Windows 10/11 (x64)** | `DSH-Studio-Setup-*.exe` (NSIS) | 双击运行安装向导，按提示完成安装并自动生成桌面快捷方式 |
| **macOS (Apple Silicon)** | `DSH-Studio-*.dmg` | 双击打开 DMG 镜像，将 `DSH Studio.app` 拖入 `Applications` 文件夹即可 |

---

## 2. 桌面端特有操作与功能说明

### 2.1 窗口与系统托盘管理
* **关闭窗口 (X)**：点击窗口右上角关闭按钮，应用将默认**最小化并常驻在系统托盘**，保持后台 Agent 任务与 MCP 服务持续运行。
* **托盘菜单功能**：
  - **显示 DSH Studio**：一键唤醒并最大化置顶主窗口。
  - **在浏览器中打开**：在系统默认浏览器中直接打开 `http://127.0.0.1:{port}` Web UI。
  - **重启后台服务**：遇到网络切换或长连接断开时，一键热重启后台 DSH 守护进程。
  - **打开数据目录**：快速定位并打开用户配置与 SQLite 会话存储目录 (`userData/dsh-data`)。
  - **打开日志目录**：快速定位并打开应用运行与后台服务输出日志 (`userData/logs`)。
  - **彻底退出**：安全终止所有后台子进程并完全退出程序。

### 2.2 单实例守护
* 多次双击快捷方式或打开安装包时，系统自动识别并唤醒已有前台主窗口，防止重复启动引起端口与数据库锁冲突。

---

## 3. 本地开发者构建与打包指南 (Developer & Build Guide)

如果你是开发者或开源贡献者，希望在本地开发或编译打包自己的桌面客户端版本：

### 3.1 环境要求
- **Node.js**：`^22.19.0 || >=24.0.0`
- **pnpm**：`11.7.0`

### 3.2 快速编译与运行

```bash
# 1. 安装项目全量依赖
pnpm install

# 2. 编译项目核心库与前端 Web UI
pnpm run build

# 3. 编译桌面端 TypeScript 源码并准备 Bundle 资产
pnpm run desktop:build

# 4. 执行桌面端自动化测试套件
pnpm run desktop:test

# 5. 以开发模式直接拉起 Electron 桌面应用
pnpm run desktop:dev
```

### 3.3 本地打包安装包 (Packaging)

```bash
# 构建 Windows x64 NSIS 安装包 (在 Windows 环境下执行)
pnpm run desktop:pack:win

# 构建 macOS Apple Silicon DMG 镜像 (在 macOS 环境下执行)
pnpm run desktop:pack:mac

# 快速解包生成免安装目录预览
pnpm run desktop:pack:dir
```

打包生成的可执行文件与安装程序将统一存放在 `apps/desktop/release/` 目录下。

---

## 4. GitHub Actions CI/CD 自动化发版流水线

本项目已配置完善的跨平台 GitHub Actions 云端流水线 (`.github/workflows/desktop-release.yml`)：

1. **触发方式**：
   - 推送版本标签：`git tag v1.0.0 && git push origin v1.0.0`
   - 手动触发：在 GitHub 仓库「Actions」页面选择 `Build & Release DSH Studio Desktop` 工作流手动触发。
2. **流水线动作**：
   - 在 `windows-latest` 虚拟机中构建 Windows x64 安装包并计算 SHA-256。
   - 在 `macos-latest` (Apple Silicon M-Series) 虚拟机中构建 macOS arm64 DMG 镜像并计算 SHA-256。
   - 自动在 GitHub Releases 中创建新版本，并上传所有构建产物与校验文件。

---

## 5. 故障排查与常见问题 (FAQ)

### Q1: 端口冲突报错如何处理？
* **解答**：桌面端内置了智能端口探测（`getAvailablePort`），如果默认 3080 端口已被其他服务占用，将自动寻找 3081~3180 空闲端口绑定，完全无需人工干预。

### Q2: 如何查看详细错误日志？
* **解答**：在系统右下角（Windows）或右上角（macOS）右键点击 DSH Studio 托盘图标，选择「打开日志目录」，即可查看 `dsh-server.log` 完整日志。

### Q3: macOS 首次打开提示“无法打开，因为无法验证开发者”？
* **解答**：在 macOS「系统设置 > 隐私与安全性」中点击「仍要打开」，或在终端执行 `xattr -cr /Applications/DSH\ Studio.app` 即可正常运行。
