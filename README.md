# 归集（Website Collector）

一个本地优先的网站收藏管家。整理、分类、检测你的收藏链接，支持多级分类、标签体系与回收站。

![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB) ![Vue](https://img.shields.io/badge/Vue-3-42B883) ![Rust](https://img.shields.io/badge/Rust-stable-orange) ![License](https://img.shields.io/badge/License-MIT-blue)

## 功能特性

- **多级分类**：支持两级父子分类，拖拽分类可调整归属
- **拖拽整理**：将网站拖到分类/标签上快速归组
- **链接检测**：批量检测网站存活状态（正常 / 失效 / 未知）
- **标签体系**：给网站打标签，支持按标签过滤、批量重命名与合并
- **回收站**：误删可恢复，支持清空或彻底删除
- **导入导出**：支持 Markdown / JSON 格式交换数据
- **本地存储**：数据保存在本地文件，隐私优先，无需账号
- **多主题**：亮色 / 暗色 / 跟随系统，支持界面缩放
- **自定义窗口**：无边框窗口，内置标题栏

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 · TypeScript · Pinia · Vite |
| 桌面框架 | Tauri 2 |
| 后端 | Rust |
| 测试 | Vitest（前端） · cargo test（Rust） |

## 安装

从 [Releases](https://github.com/liangcheng147/website-collector/releases) 下载对应安装包：

- `归集_<版本>_x64-setup.exe` — NSIS 安装器（推荐）
- `归集_<版本>_x64_zh-CN.msi` — MSI 安装包

> 依赖 [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) 运行时（Windows 10/11 通常已内置）。

## 开发环境

需要安装 [Node.js](https://nodejs.org/)（≥ 18）与 [Rust](https://www.rust-lang.org/)（stable）。

```bash
# 安装依赖
npm install

# 启动开发模式（热更新）
npm run tauri dev

# 运行测试
npm test
cd src-tauri && cargo test

# 构建安装包
npm run tauri build
```

### 结构说明

```
src/                  # 前端源码
  components/         # Vue 组件
  store/              # Pinia 状态
  composables/        # 组合式函数
  api.ts              # Tauri IPC 调用
src-tauri/            # Rust 后端
  src/                # Tauri 命令
  tauri.conf.json     # 应用配置
```

## 数据存储

应用数据以 JSON 文件保存在系统数据目录（可在「设置」中查看位置）。导出功能可将数据转换为 Markdown 或 JSON 便于备份与迁移。

## 发布流程

推送版本标签（如 `v0.1.0`）会自动触发 [GitHub Actions](.github/workflows/release.yml) 在云端构建安装包并创建 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 许可证

[MIT](LICENSE)