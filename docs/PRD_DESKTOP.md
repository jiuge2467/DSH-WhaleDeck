# DSH Studio Desktop 桌面端产品需求文档 (PRD)

> **版本**：v1.0.0-Draft  
> **责任角色**：🎯 PM (产品经理)  
> **文档状态**：待评审 (Phase 1 门禁评审中)  
> **参考项目**：[anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)

---

## 1. 需求背景与目标 (Why & Who)

### 1.1 需求四问
1. **目标用户 (Who)**：
   - 希望使用 DeepSeek Harness 强大 Agent 能力，但不想折腾 Node.js 22+、pnpm、命令行编译、环境变量与补丁配置的普通用户与开发者。
   - 依赖 DSH Studio 深度集成功能（MCP 多源可视化中心、CoT 视觉看图、小鲸鱼姬 2.0 灵动桌宠、增强侧边栏）的桌面端极客用户。
2. **核心场景 (Where & When)**：
   - **Windows x64**：双击下载的 `.exe` (NSIS) 安装包，一键安装完成并创建桌面/开始菜单快捷方式，双击直接启动全栈 Agent 工作台。
   - **macOS Apple Silicon (arm64)**：打开 `.dmg` 镜像，将 `DSH Studio.app` 拖入 `Applications` 目录，单击即可启动。
   - **离线与本地守护**：桌面端窗口关闭时可最小化至系统托盘，后台持续保持 Agent 长程任务与服务；需要时从托盘一键呼出。
3. **解决痛点 (What & Pain Points)**：
   - ❌ **环境门槛高**：原版 DSH 必须依赖 Node.js >= 22.19、pnpm 11+ 以及手动执行构建，非前端/Node 开发者难以安装。
   - ❌ **缺少桌面体验**：浏览器 Web 标签页容易被误关，缺乏系统托盘驻留、窗口状态记忆、离线通知与原生菜单。
   - ❌ **插件配置复杂**：用户需要手动编辑 `~/.dsh/profiles/web/cordis.patch.yml` 并执行 `dsh plugin add`，缺乏开箱即装好 Studio 核心套件的完整打包体验。
4. **参考方案与开源愿景 (Reference & Open Source)**：
   - 参考 `anywhere-labs/deepseek-harness-desktop` 的 Electron 薄宿主架构：利用 Electron Main 进程托管 DSH 运行时，内部通过本地 Loopback 端口提供 Web UI，保持 100% 插件化兼容与架构纯净。
   - 保持开源开放，支持社区贡献代码与共同优化桌面端体验。

---

## 2. 功能范围与优先级矩阵 (Scope Matrix)

| 模块 | 功能项 | 优先级 | 说明 |
| :--- | :--- | :---: | :--- |
| **桌面宿主** | Electron 原生容器 | **P0** | 基于最新稳定版 Electron 构建跨平台窗口与主进程生命周期 |
| **运行集成** | 零依赖内置 Runtime | **P0** | 内置 Node.js / DSH Studio 产物，用户无需单独安装 Node.js/pnpm |
| **服务守护** | 本地 WebServer 自动托管 | **P0** | 主进程自动拉起 DSH Web 服务，动态分配/健康探测端口，退出时级联 Teardown 进程树 |
| **窗口与托盘** | 窗口管理与系统托盘 | **P0** | 支持多屏自适应、窗口尺寸位置记忆、最小化到托盘、托盘右键菜单（打开/重启/日志/退出） |
| **单实例锁** | Single Instance Lock | **P0** | 防止重复启动多个应用导致端口与 SQLite 会话锁冲突，二次拉起自动聚焦已有窗口 |
| **预装套件** | Studio 核心功能全开箱 | **P0** | 默认集成 MCP 可视化管理中心、CoT 视觉看图、小鲸鱼姬桌宠、增强侧边栏等 |
| **跨平台打包** | Windows x64 NSIS 安装包 | **P0** | 生成标准化一键安装程序 (`.exe`)，支持创建快捷方式与卸载程序 |
| **跨平台打包** | macOS Apple Silicon DMG | **P0** | 生成标准化 `.dmg` 拖拽安装镜像 (arm64)，支持高清应用图标 |
| **自动化发布** | GitHub Actions CI/CD | **P0** | 多平台矩阵构建、Release 自动化产物分发与 SHA-256 校验和生成 |
| **用户体验** | 启动 Splash 加载屏 | **P1** | 后台服务未就绪前展示品牌 Loading 动画，服务就绪后秒级平滑过渡到主界面 |
| **运维支持** | 一键打开日志/工作区目录 | **P1** | 托盘与菜单栏提供直接定位应用日志、配置目录与数据目录 |
| **高级扩展** | 开机自启开关 | **P2** | 系统设置中提供开机随系统静默自启选项 |

### ⛔ 显式排除项 (Out of Scope)
* **移动端 (iOS / Android)**：当前聚焦桌面端 Windows x64 / macOS Apple Silicon。
* **重写底层 Agent Loop**：桌面端作为纯净外壳容器，不对 DSH 核心 Cordis 插件系统与 Agent Loop 做任何魔改。

---

## 3. EARS 验收标准 (Acceptance Criteria)

### 3.1 全局特性 (Ubiquitous)
* `EARS-U-01`：应用在未安装 Node.js、Git、pnpm 的纯净 Windows 10/11 x64 与 macOS 13+ (Apple Silicon) 设备上必须能独立完整运行。
* `EARS-U-02`：应用必须通过安全沙箱与进程树生命周期管理，主程序退出或崩溃时，不得在后台遗留孤儿 `node.exe` 僵尸进程。

### 3.2 事件驱动 (Event-driven)
* `EARS-E-01`：**当** 用户双击运行安装包时，**系统应** 弹出标准化安装向导（Windows）或展示应用程序拖拽窗口（macOS）。
* `EARS-E-02`：**当** 用户点击窗口关闭按钮 (X) 时，**系统应** 默认最小化隐藏至系统托盘，并保持后台长程 Agent 任务正常运行。
* `EARS-E-03`：**当** 用户在托盘右键菜单中选择「彻底退出」时，**系统应** 先优雅关闭 DSH 服务，释放数据库与网络句柄，随后终止主进程。
* `EARS-E-04`：**当** 用户重复双击应用快捷方式时，**系统应** 触发单实例锁逻辑，唤醒并聚焦前台已有窗口，禁止创建重复进程。

### 3.3 状态驱动 (State-driven)
* `EARS-S-01`：**在** DSH 后台服务启动阶段（State: Booting），**系统应** 展示优雅的 Splash Screen，并实时监听 Loopback 端口健康状态（HTTP 200）。
* `EARS-S-02`：**在** 检测到端口就绪后（State: Ready），**系统应** 将主窗口导航至对应地址并渐隐关闭 Splash Screen。
* `EARS-S-03`：**在** 发生端口占用时（State: Port Conflict），**系统应** 自动回退探测备用端口，或向用户展示友好诊断提示。

### 3.4 异常行为与边界防御 (Unwanted Behavior / Boundary)
* `EARS-B-01`：**如果** 用户安装路径包含中文字符或空格，**系统应** 确保 Node 运行时及工作区路径正常转义，不得出现 ENOENT 或乱码崩溃。
* `EARS-B-02`：**如果** 本地防火墙或安全软件弹出拦截，**系统应** 将日志清晰记录在 `%APPDATA%\dsh-studio\logs` 或 `~/Library/Logs/dsh-studio` 中供排查。

---

## 4. 技术风险与应对预案

| 风险项 | 风险等级 | 应对预案 |
| :--- | :---: | :--- |
| **ASAR 打包与 Node 原生二进制 / 动态脚本加载** | 高 | 将需要动态加载/运行的脚本、二进制依赖（如 pnpm、node_modules、模板）精确配置到 `asarUnpack`，避免虚拟路径无法执行 |
| **Electron 内存与进程树残留** | 中 | 封装健壮的 `ProcessTreeKiller`（Windows 用 `taskkill /pid /t /f`，macOS 用 `kill -TERM / tree-kill`），在 `before-quit` 与异常退出钩子中强制回收 |
| **macOS Apple Silicon 代码签名与 Gatekeeper** | 中 | 提供详尽的 `xattr -cr /Applications/DSH\ Studio.app` 绕过引导，在 CI/CD 中配置自动化构建脚本 |
| **构建体积控制** | 中 | 前端资源构建生产环境最小化，剔除 DevDependencies、测试用例和文档文件，保持安装包体积精简 |

---

## 5. 项目交付阶段路线图 (Milestones)

- **Phase 1: PRD & Scope (PM)** —— 需求收敛、功能矩阵锁定与 EARS 验收标准制定（当前阶段，等待用户确认）。
- **Phase 2: Arch & DB (ARCH)** —— 目录树规划、Electron 进程架构设计、启动生命周期时序图、打包配置 Spec 锁定。
- **Phase 3: Coding (DEV)** —— Electron 主进程/预加载/托盘/窗口逻辑实现、内置服务装配、生产构建脚本。
- **Phase 4: Test & Verify (QA)** —— 跨平台启动测试、托盘/窗口状态测试、单实例锁测试、进程生命周期测试、产出测试报告。
- **Phase 5: Package & Build (OPS)** —— 配置 electron-builder，生成 Windows NSIS 安装包与 macOS DMG 镜像，验证打包产物。
- **Phase 6: Release & DevOps (OPS)** —— 配置 GitHub Actions CI/CD 流水线，输出详细的《桌面端安装使用与开源贡献指南》。
