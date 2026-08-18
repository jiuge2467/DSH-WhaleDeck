# @linxin666/dsh-client-ui-skin-dragon-heir

[English](README.md) | 中文

龙的传人 (Dragon Heir) dsh web GUI 皮肤——一皮双画：亮色主题走 不屈龙魂（水墨龙 + 朱砂印），暗色主题走 万里长城（黄昏的墨蓝群山 + 晨曦鎏金点缀）。两幅画作与两枚印章 favicon 都是内联 data URL，因此本皮肤不附带任何静态文件。

以官方独立 bundle 形态热插拔为客户端插件：`apply()` 设置 `data-dsh-dragon-heir` body 属性（整张样式表的生效范围）、挂载带可读性遮罩的主题龙背景与主题 龙印 favicon——当基础主题系统翻动 `data-ds-dark-theme` 时实时切换画作、遮罩与印章——其 effect 清理器收回每一处写入，原样恢复任何先前背景。样式表随 bundle 的 CSS-modules 自动注入，loader 会随条目一并移除。

本皮肤只做呈现：不注入服务、不发 cordis 事件、不触任何模型请求。

## 安装（官方 bundle 方式）

推荐先装皮肤全家桶聚合包 `@linxin666/dsh-skins` 一次到位；只装本皮肤时用下列 link 命令。

```sh
# 装全部皮肤（推荐）
dsh plugin --profile web add @linxin666/dsh-skins
# 或单独装本皮肤
dsh plugin --profile web add @linxin666/dsh-client-ui-skin-dragon-heir
# 皮肤启用：dsh-skin use dragon-heir
# 从仓库安装（开发调试）：dsh plugin --profile web add link:$(pwd)/packages/skins/dragon-heir
```

`$(pwd)` 指克隆全家桶仓库后的目录。

本地 link 安装前需先在全家桶仓库内构建产物（`lib/` 被 git 忽略、不随仓库提交）：`pnpm install && pnpm -r build` 后再 link 安装。通过 git 安装（`dsh plugin --profile web add github:<org>/dsh-web-ui#<sha>`）时 `prepare` 脚本自动自包含构建 `lib/`，无需单独构建；pnpm ≥10 首次安装 git 依赖需先把 pnpm 打印的包键加入相应 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 列表再重试。

皮肤启用 / 切换用 `dsh-skin use dragon-heir`（本仓库 `scripts/dsh-skin` 辅助脚本）；同一时刻只激活一个皮肤。

## 构建与测试

```sh
pnpm build   # tsdown: lib/index.js + lib/client.js (self-contained preset)
pnpm test    # vitest: apply/dispose contract spec (dual-theme art swap)
```

## 发布到皮肤中心

```sh
node scripts/skin-center-bundles    # re-embed this skin into skin-center's registry
pnpm --filter @linxin666/dsh-client-ui-skin-center build
node scripts/gallery-build          # refresh the gallery manifest/bundles
node scripts/capture-previews       # re-shoot preview/light.png + preview/dark.png
```

然后提交全部（lib/、preview/、再生成的 registry/gallery）并开 PR。

## 画作替换

两幅画作以 data URL 存在 `src/client/art.ts`（`LIGHT_ART` / `DARK_ART`）；原始生成的 PNG 保留在 `artwork/`（仅仓库源码，不随 bundle 分发）。要换入新画作，用嵌入脚本——它经无头 Chromium 压缩为 WebP（约 1600px 宽、质量 75、≤800 KiB）并把 base64 直接拼进常量：

```sh
node scripts/embed-skin-art dragon-heir LIGHT_ART /path/to/ink-dragon.png
node scripts/embed-skin-art dragon-heir DARK_ART /path/to/gold-dragon.png
```

然后 `pnpm build`、`node scripts/capture-previews dragon-heir`，并重跑 skin-center/gallery 再生成。印章 favicon（`LIGHT_ICON` / `DARK_ICON`）是自包含 SVG，永远无需替换。
