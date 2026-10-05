# 设置页「关于」与 GitHub 更新系统设计

日期：2026-10-05

## 目标

在设置弹窗中新增「关于」分段，展示软件信息与版本号，并通过 `tauri-plugin-updater` 实现应用内更新：检查 GitHub Releases 上的最新版本、下载安装、重启生效。

## 范围

- 设置页新增 `about` 分段（基本信息、链接与作者、更新入口、技术信息、自动检查开关）
- 接入官方 updater 插件（Rust + JS 两侧）
- release.yml 注入签名密钥，自动产出 `latest.json` 与签名安装包
- 设置项新增 `autoCheckUpdate`（默认 true）
- 启动时按设置静默检查更新

不包含：自定义下载器、增量差异包之外的额外分发渠道、更新日志渲染（仅展示 `latest.json` 里的 notes 文本）。

## 后端（Rust）

- `src-tauri/Cargo.toml`：新增 `tauri-plugin-updater` 与 `tauri-plugin-process`（重启需要）。
- `src-tauri/src/lib.rs`：注册 `tauri_plugin_updater::Builder::new().build()` 与 `tauri_plugin_process::init()`。
- `src-tauri/src/settings.rs` 的 `Settings`：新增 `auto_check_update: bool`（serde 默认 true，保持旧 settings.json 兼容）。
- `src-tauri/tauri.conf.json`：
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.endpoints`: `["https://github.com/liangcheng147/website-collector/releases/latest/download/latest.json"]`
  - `plugins.updater.pubkey`: 签名公钥（生成后填入）
- 私钥通过环境变量 `TAURI_SIGNING_PRIVATE_KEY`（及 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）注入，不写入仓库。

## 前端

- `package.json`：新增 `@tauri-apps/plugin-updater` 与 `@tauri-apps/plugin-process`。
- `src/types.ts`：`Settings` 增加 `autoCheckUpdate: boolean`。
- `src/store/app.ts`：settings 默认值与加载/保存处同步新字段。
- `src/components/SettingsModal.vue`：新增 `about` 分段：
  - 基本信息：应用名、版本号（`@tauri-apps/api/app` 的 `getVersion()`）
  - 链接与作者：GitHub 仓库链接（`plugin-opener` 打开）、作者、许可证
  - 更新入口：当前版本、状态文案；「检查更新」按钮；发现新版本时显示版本号与 notes，「下载并安装」按钮（下载进度条），完成后「重启」按钮（`process.relaunch()`）
  - 技术信息：Tauri 版本、WebView UA
  - 开关：自动检查更新（绑定 `autoCheckUpdate`）
- `src/App.vue` onMounted：若 `autoCheckUpdate` 为 true，静默调用 `check()`，有新版本时用轻量提示（toast/横幅）告知用户。

## CI

`.github/workflows/release.yml` 的 tauri-action 步骤增加 env：

```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

tauri-action 检测到该 env 后自动生成签名产物与 `latest.json` 并上传到 Release。

## 权限

`src-tauri/capabilities/default.json` 增加：`updater:default`、`process:allow-relaunch`。

## 测试

- 前端：updater 相关逻辑抽成小函数，测试时 mock `@tauri-apps/plugin-updater` 与 `@tauri-apps/plugin-process`；`SettingsModal` about 分段渲染一条 Vitest。
- Rust：`cargo test` 不受影响（无新纯逻辑）。`settings.rs` 的 serde 默认兼容可补一条单测。

## 发布流程

1. 本地 `tauri signer generate` 生成密钥对；pubkey 写入 `tauri.conf.json`，私钥与密码存 GitHub Secrets（同时存一份到本地安全位置）。
2. 推送 `v*` 标签触发 CI 构建，Release 自动附带 `latest.json` 与签名安装包。

## 风险与注意

- `latest.json` 下载 URL 需与 CI 实际上传的资源名一致；首次发布后以 Release 页面实际文件为准校正。
- 未配置私钥时 updater artifacts 不会生成，旧客户端检查更新会失败——首次启用需发布一个带 updater 的版本作为基线。
- Windows 透明无边框窗口下，更新提示的 UI 需走现有弹层/样式体系。
