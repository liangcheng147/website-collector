# UI 精修设计文档

> SiteCollector v0.2.1 UI 视觉精修方案

## 目标

在保留现有功能架构和 CSS 变量系统的前提下，系统性提升视觉精致度和一致性。采用**渐进式精修**方案，不破坏现有功能。

## 设计令牌

### 间距（4px 基准）
```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

### 圆角
```css
--radius-sm: 6px;   /* 小元素 */
--radius-md: 10px;  /* 按钮/输入框 */
--radius-lg: 14px;  /* 卡片/弹窗 */
--radius-full: 999px; /* 胶囊 */
```

### 阴影（三级）
```css
--shadow-sm: 0 1px 2px rgba(0,0,0,.05);
--shadow-md: 0 4px 12px rgba(0,0,0,.08);
--shadow-lg: 0 12px 32px rgba(0,0,0,.12);
```

### 过渡
```css
--duration-fast: 120ms;
--duration-normal: 180ms;
--duration-slow: 250ms;
--ease: cubic-bezier(.2,.7,.3,1);
```

## 组件升级清单

### 1. 图标统一
- emoji → lucide-vue-next（AlertTriangle, Trash2, Plus, LayoutGrid, Settings, Square, Play, X, Undo2, ExternalLink, UnfoldVertical, FoldVertical, Search）
- 保持线条粗细、圆角、尺寸一致

### 2. 按钮层级
- 「添加」用 primary 实心（品牌色背景 + 白色文字 + 字重 600）
- 「检测全部」用 outline 风格
- 管理/导入导出/设置用 ghost 风格
- 危险操作用 danger 风格
- `:active` 统一 `scale(.97)` 反馈

### 3. 表格优化
- 行高从 `6px 10px` 增加到 `8px 10px`
- 名称列加粗（`font-weight: 600`）
- 选中行左侧加 3px 品牌色竖条（`box-shadow: inset 3px 0 0 var(--primary)`）
- 状态列圆点指示器加微妙光晕
- hover 背景色过渡 `180ms`

### 4. 侧边栏卡片分组
- 每个分组（分类/视图/标签/系统）用微妙背景色卡片包裹
- 活跃项左侧加 3px 品牌色竖条
- 分组标题用小号大写 + 字母间距

### 5. 空状态
- 品牌色渐变背景卡片
- 引导性操作按钮（如「添加第一个网站」）
- 图标尺寸 48px + 品牌色

### 6. 弹窗动画
- 缓动函数改为 spring 风格 `cubic-bezier(.2,.7,.3,1)`
- 遮罩层 `backdrop-filter: blur(8px)` + 透明度 `rgba(0,0,0,.5)`
- 弹窗阴影用 `--shadow-lg`

### 7. 右键菜单
- 每个菜单项前加对应 lucide 图标
- 图标与文字间距 8px

### 8. 状态栏
- 信息块之间用竖线分隔
- 失效数用红色 badge（`border-radius: 999px` + `padding: 1px 8px`）
- 检测进度用迷你进度条 + 百分比

### 9. 标题栏
- 品牌 logo 图标（lucide `Bookmark`）+ 「归集」文字
- 窗口控制按钮 hover 时加圆角背景

### 10. 微交互
- 按钮 active `scale(.97)` + `120ms` 过渡
- 标签 chip hover 上浮 `translateY(-1px)`
- 复选框选中过渡动画
- 输入框焦点边框色过渡 + ring 光晕过渡

### 11. 滚动条
- `width: 6px`
- `border-radius: 3px`
- hover 时 `background: var(--primary)`

### 12. 全站 Tooltip
- 统一样式：品牌色深色背景 + 圆角 6px + 12px 字体
- 所有图标按钮加 tooltip

### 13. 搜索框
- 左侧加搜索图标
- 焦点时边框高亮 + ring 光晕

### 14. 暗色模式微调
- 提高文字对比度
- 品牌色按钮加微妙光晕 `box-shadow: 0 0 8px rgba(45,212,191,.3)`

### 15. 配色方案
- 保持 11 套配色
- 每套定义 6 个变量：`--primary`, `--primary-w`, `--primary-t`, `--ok`, `--pending`, `--ring`

## 剔除项（不修改）

| 剔除项 | 理由 |
|--------|------|
| Toast 通知系统 | 当前状态栏闪现已够用，过度设计 |
| 分类树连接线 | 当前缩进+箭头已清晰，连接线增加视觉噪音 |
| 拖拽动画增强 | 当前虚线边框已足够，动画非必要 |
| 搜索框清除按钮 | 额外功能，当前够简洁 |
| 输入框焦点过渡动画 | 当前焦点状态已清晰 |

## 实施阶段

1. **第一阶段**：设计令牌 + 按钮系统 + 表格优化 + 图标统一
2. **第二阶段**：侧边栏 + 空状态 + 弹窗动画 + 状态栏
3. **第三阶段**：右键菜单 + 标题栏 + 搜索框 + 微交互
4. **第四阶段**：滚动条 + tooltip + 暗色模式微调 + 全面测试

## 测试计划

- `npm test`（Vitest）确保现有测试不受影响
- `cd src-tauri && cargo test` 确保 Rust 测试通过
- `npm run build`（vue-tsc + vite build）确保类型检查和构建通过
- 手动视觉检查亮色/暗色模式下所有改动
