# 添加宠物

[English](adding-a-pet.md) | 中文

本文说明如何向 **dsh-desktop-pet** 添加一个新的桌面宠物。

一个宠物就是一个目录，内含一个清单文件 `pet.json` 和一张精灵图
`spritesheet.webp`（或 `.png`）。插件启动时会扫描两个位置，把发现的每个宠物
列进设置页的下拉列表：

- **用户宠物目录**（`~/.dsh/desktop-pet/pets/<id>/`）——从文件夹或 Petdex 导入的宠物
  都放在这里。这是添加宠物的常规途径；导入的宠物位于已安装包之外，因此插件升级后依然保留。
- **随包宠物目录**（已安装包内的 `assets/pets/<id>/`）——随插件一起发布的宠物。
  普通用户通常不需要往这里写：该目录归包所有，每次升级都会被替换。

当同一宠物 id 在两个位置都存在时，用户目录优先。

## 最省事的方式：使用设置卡片

打开 **设置 → 插件 → 插件配置 → 桌面宠物**。卡片上有两个导入按钮：

- **从文件夹添加** —— 选择磁盘上任意已包含宠物（`pet.json` + 精灵图）的目录。
  插件会校验、把目录复制进用户宠物目录，并切换到它。
- **从Petdex添加** —— 输入 Petdex slug；插件运行 `npx petdex install <slug>`
  （第三方社区 CLI），然后把下载的目录导入用户宠物目录。

## 手动添加宠物

下面每个方法都先给出一条可复制给编码 agent 的 **prompt**，随后是你可以自己动手的
**手动详细步骤**。所有手动方法的终点都是把宠物目录复制进**用户宠物目录**，而不是
插件的 `assets/pets/`。

### 1. 使用 hatch-pet

**Prompt：**

```text
运行 hatch-pet 技能生成一个宠物；生成后把其输出目录（含 pet.json 和 spritesheet.webp）
复制到 ~/.dsh/desktop-pet/pets/<目录名>/，然后重启插件，让宠物出现在设置页下拉列表。
```

**手动步骤：**

1. 在 Codex（或内置该技能的编码 agent）中运行 hatch-pet 技能。生成的目录位于
   `~/.codex/pets/<name>/`，其中已经包含 `pet.json` + `spritesheet.webp`。
2. 把该目录复制到 `~/.dsh/desktop-pet/pets/<目录名>/`。
3. 重启插件（重启 Harness，或重新加载插件）。
4. 打开 **设置 → 插件 → 插件配置 → 桌面宠物**，在宠物下拉列表里选择新宠物。

### 2. 导入已有文件夹

**Prompt：**

```text
把目录 <源目录>（含 pet.json 和 spritesheet.webp）复制到 ~/.dsh/desktop-pet/pets/<目录名>/，
然后重启插件，让它出现在设置页宠物下拉列表。
```

**手动步骤：**

1. 确认 `<源目录>` 内含 `pet.json` 和 `spritesheet.webp`（或 `.png`）。
2. 复制到 `~/.dsh/desktop-pet/pets/<目录名>/`。目录名即宠物 id。
3. 重启插件。
4. 在设置页宠物下拉列表里选择新宠物。

### 3. 使用 Petdex 社区

**Prompt：**

```text
运行 npx petdex install <slug> 下载社区宠物，然后把下载目录（含 pet.json 和
spritesheet.webp）复制到 ~/.dsh/desktop-pet/pets/<slug>/，重启插件后自动出现在宠物下拉列表。
```

**手动步骤：**

1. 运行 `npx petdex install <slug>`。Petdex 是第三方社区，宠物会下载到
   `~/.petdex/pets/<slug>/`（旧版本使用 `~/.codex/pets/<slug>/`）。
2. 把该目录复制到 `~/.dsh/desktop-pet/pets/<slug>/`。
3. 重启插件。
4. 在设置页宠物下拉列表里选择新宠物。

## 宠物目录结构

```text
~/.dsh/desktop-pet/pets/<目录名>/
├── pet.json          # 清单文件（id / displayName / description / spritesheetPath）
└── spritesheet.webp  # 精灵图（无损 WebP 或 PNG）
```

> **占位符说明**
> - `~/.dsh` — 与插件其它数据共享的用户数据目录。
> - `<目录名>` / `<id>` / `<slug>` — 宠物目录名（下拉列表里作为宠物 id 使用）。
> - `<源目录>` — 一个已包含上述两个文件的现有目录。

## 资源格式参考

> 普通用户通常无需手工制作这些文件，上述工具已经产出符合本格式的目录。本节仅供需要核对
> 或自制资源的用户参考。

### `pet.json`

四个字段：

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A short sentence describing the pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

| 字段 | 是否必需 | 含义 |
|---|---|---|
| `id` | 是 | 标识字段。设置页下拉列表实际使用**目录名**作为宠物 id。 |
| `displayName` | 是 | 设置页宠物下拉列表里显示的标签。 |
| `description` | 可选 | 人类可读的描述。 |
| `spritesheetPath` | 是 | 同目录下精灵图文件的文件名。 |

### 精灵图

| 属性 | 值 |
|---|---|
| 格式 | 无损 WebP（推荐）或 PNG |
| 尺寸 | **1536 × 1872** px |
| 网格 | **8 列 × 9 行** |
| 单元格 | **192 × 208** px |
| 背景 | 透明 |
| 未使用单元格 | 完全透明 |

动画行是固定的，顺序如下（第 0 行在最上方）：

| 行 | 状态 | 帧数 |
|---|---|---|
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

帧按行优先、从左到右排列：第 `r` 行第 `i` 帧位于 `x = i * 192`、`y = r * 208` 的单元格。

## 注意事项

- 导入的宠物存放在**用户宠物目录**（`~/.dsh/desktop-pet/pets/`）。不要为了你自己的宠物
  去改插件的 `assets/pets/`——该目录在每次插件升级时都会被替换，改动会丢失。
- 宠物按固定的 9 状态动画格式渲染；宽度小于 1536 px 或高度小于 1872 px 的精灵图会在日志中明确报错。
- 扫描时会跳过损坏的宠物目录；其余宠物仍能加载。若没有任何有效宠物，插件会回退到内置的 `text` 宠物。
- 内置的 `text` 宠物是有意唯一随包发布的宠物。它用不同颜色和文字渲染每个状态，便于验证宠物外观是否跟随 harness 任务状态。
