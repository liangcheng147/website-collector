# 对话框布局优化 + 配色系统设计

**日期：** 2026-09-29  
**状态：** 已确认

---

## 背景

当前编辑对话框（AddEditModal）存在两个问题：
1. 左侧堆砌所有字段，右侧仅有一个"快捷操作"提示栏，空间利用不平衡
2. 备注 textarea 高度仅 52px，对于 200 字的内容来说太窄

同时，应用目前仅支持亮/暗模式切换，缺少配色个性化选项。

---

## 功能一：对话框布局优化

### 目标
重新排列 AddEditModal 的字段布局，使备注区域更宽敞，整体更平衡。

### 方案
采用两栏 + 底部全宽的布局：

```
┌──────────────────────────────────────────┐
│  名称: [______]  │  分类: [______▼]     │
│  链接: [______]  │  标签: [______]      │
│   [获取名称]     │                       │
├──────────────────────────────────────────┤
│  备注（200字以内）                    42/200│
│  [                                    ]  │
│  [            横跨全宽，80px高         ]  │
├──────────────────────────────────────────┤
│                    [取消]  [保存]         │
└──────────────────────────────────────────┘
```

### 变更范围
- **文件：** `src/components/AddEditModal.vue`
- **改动：** 仅模板部分，`.modal-cols` 从单栏+右侧帮助改为双栏+底部备注
- **移除：** 右侧 `.help` 区域（快捷操作提示）
- **保留：** 所有字段、验证逻辑、事件处理完全不变

### CSS 适配
- `main.css` 中 `.modal-cols` 的 `grid-template-columns: 1fr 1fr` 已满足需求，无需修改
- 备注 textarea 高度从 52px 改为 80px

---

## 功能二：配色系统

### 目标
提供多套高级感色板供用户切换，仅改变视觉效果，不影响任何功能。

### 11 套色板

| ID | 名称 | 主色 | 风格 |
|----|------|------|------|
| teal | 青绿 | `#0D9488` | 清爽知性（默认） |
| ocean | 海洋 | `#2563EB` | 沉稳专业 |
| indigo | 靛青 | `#4F46E5` | 深邃优雅 |
| violet | 紫罗兰 | `#7C3AED` | 创意艺术 |
| rose | 玫瑰 | `#E11D48` | 热情精致 |
| amber | 琥珀 | `#D97706` | 温暖复古 |
| emerald | 翡翠 | `#059669` | 平和自然 |
| slate | 石墨 | `#475569` | 极简商务 |
| stone | 砂岩 | `#57534E` | 大地色系 |
| sky | 天空 | `#0284C7` | 轻盈清新 |
| plum | 梅紫 | `#A21CAF` | 神秘高贵 |

### 技术实现

#### CSS 架构
每套配色是一个 CSS 变量集合，通过 `data-palette` 属性作用域化：

```css
html[data-palette="ocean"][data-theme="light"] {
  --primary: #2563EB;
  --primary-w: #1E40AF;
  --primary-t: #DBEAFE;
  /* ... 其他变量 ... */
}

html[data-palette="ocean"][data-theme="dark"] {
  --primary: #3B82F6;
  --primary-w: #60A5FA;
  --primary-t: #1E3A5F;
  /* ... 暗色版本 ... */
}
```

与现有 `data-theme` 系统独立运作，切换配色不影响亮/暗偏好。

#### 变量清单

**每套配色独立定义（共 6 个）：**
```
--primary      主色（按钮、链接、高亮）
--primary-w    主色深色（hover、active）
--primary-t    主色浅色（tag 背景、tint）
--ok           ✓ 状态色
--pending      ⟳ 检测中状态色
--ring         focus 阴影色（rgba 基于 primary）
```

**全局共享（:root 中定义，所有配色统一）：**
`--accent`, `--accent-on`, `--ok-txt`, `--pending-txt`, `--bg`, `--panel`, `--text`, `--text-2`, `--border`, `--border-2`, `--hover`, `--danger`, `--danger-bg`, `--danger-bd`, `--radius`, `--shadow`, `--font` 等。

> 设计原则：accent（橙色）作为视觉锚点保持不变，仅主色和状态色跟随配色变化。

#### Settings 扩展
```typescript
// types.ts
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  palette: string  // 新增，默认 'teal'
  zoom: number
  sidebarCollapsed: string[]
  collapsedCategories: string[]
}
```

#### 应用逻辑
```typescript
// store/app.ts applyAppearance()
document.documentElement.dataset.palette = this.settings.palette
```

#### 设置入口
在 `SettingsModal.vue` 的"主题"tab 中，亮/暗模式选择器下方增加配色网格：
- 11 个色块按钮，3×4 网格排列
- 当前选中的色块有描边/缩放高亮
- 点击即时切换，无需保存按钮

### 变更范围
| 文件 | 改动 |
|------|------|
| `src/styles/main.css` | 新增 11 套 `[data-palette="xxx"]` 变量块 |
| `src/types.ts` | Settings 接口新增 `palette: string` |
| `src/store/app.ts` | 默认值 + applyAppearance 设置 data-palette |
| `src/components/SettingsModal.vue` | 主题 tab 增加配色选择网格 |
| `src-tauri/` | 无需改动 |

### 安全保证
- 只覆盖 CSS 变量值，零 JS/Rust 功能逻辑改动
- 所有功能、布局结构、交互行为完全不变
- 切回默认配色无任何副作用

---

## 实现顺序

1. 布局调整（AddEditModal 模板重构）
2. Settings 接口扩展（types.ts + store 默认值）
3. 配色 CSS 变量编写（11 套 × 亮/暗）
4. 设置页配色选择器 UI
5. applyAppearance 增加 palette 应用逻辑
6. 全量测试（Vitest + 手动验证）

---

## 验收标准

- [ ] 编辑对话框布局为两栏，备注在下方全宽
- [ ] 备注 textarea 高度 80px
- [ ] 设置页可选择 11 套配色
- [ ] 配色切换即时生效，不影响亮/暗模式
- [ ] 重启应用后配色设置持久化
- [ ] 所有现有测试通过
