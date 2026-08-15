# dsh-desktop-pet

[English](README.md) | 中文

**dsh-desktop-pet** 是 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的一个**可选桌面伴侣**插件。它用一个小动画宠物作为环境状态指示器：harness 空闲时宠物放松，模型推理时"思考"，执行工具时"工作"，等待输入时"求关注"，一轮任务结束时庆祝（或皱眉）。

它**不是**第二个聊天界面，不是任务管理器，也不是完整的桌面应用。它是一个状态指示器。

- **插件优先**：就是一个普通的 deepseek-harness 插件——没有独立启动的守护进程、浏览器或桌面应用。
- **零网络**：所有资源随插件发布；无遥测、无 CDN、无远程服务。
- **零额外 LLM 成本**：事件 → 状态的解析完全确定，不额外调用模型。
- **运行时发现宠物**：`assets/pets/` 下的宠物在启动时自动发现，添加宠物就是放进一个文件夹——无需重新构建。

---

## 安装

插件是一个同时包含宿主半（宠物窗口）和客户端半（设置卡片）的 Cordis **组合包**。`dsh plugin add` 会安装它，并因清单里声明了 `dsh.bundle` 而自动把它加入 profile 的 bundle 列表。

### 从 npm 安装

```sh
dsh plugin --profile <name> add dsh-desktop-pet
```

### 从本地目录安装

直接从插件源码目录安装（profile 会把它作为 `link:` 依赖保留）：

```sh
dsh plugin --profile <name> add /path/to/dsh-desktop-pet
```

Windows 下示例：

```sh
dsh plugin --profile web add D:/deepseek-pet
```

也可以在插件目录内执行 `dsh plugin --profile <name> add .`。

### 从 tarball 安装

先打包，再安装 tarball：

```sh
npm pack
dsh plugin --profile <name> add /path/to/dsh-desktop-pet-0.1.0.tgz
```

### 从 Git 仓库安装

```sh
dsh plugin --profile <name> add github:sereinmono/dsh-desktop-pet
```

如果仓库未提交构建产物，请配置 `prepare` 脚本，让 `dsh plugin add` 在安装时构建插件。

### 运行

```sh
dsh --profile <name>
```

> 如果你是从 harness 仓库源码运行，请在 harness 仓库目录内把上面的命令加上 `pnpm` 前缀——即执行 `pnpm dsh plugin ...` 与 `pnpm dsh ...`。

> 设置卡片需要 harness 暴露 `desktop-pet` 设置命名空间（通过其 `WEB_SETTINGS_NAMESPACES` 白名单）；宠物窗口本身不依赖该白名单。

### 启用 / 停用

把插件配置里的 `enabled` 设为 `false`，或从 profile 中移除该 bundle。此时插件仍会加载但不显示任何东西；完全移除它对 Harness 正常运行毫无影响。

---

## 添加宠物

宠物是遵循固定精灵图格式的普通文件夹。专属指南里介绍了三种常见的获取方式，每种都配有可复制的 prompt 和手动步骤：

- **hatch-pet** —— 用技能生成宠物，然后把输出文件夹放进 `assets/pets/`。
- **导入已有文件夹** —— 把含 `pet.json` + `spritesheet.webp` 的文件夹复制进 `assets/pets/`。
- **Petdex 社区** —— 下载一个社区宠物并复制进去。

完整流程见 **[添加宠物](docs/adding-a-pet.zh.md)**，确切的 `pet.json` 与精灵图布局见 **[资源格式参考](docs/adding-a-pet.zh.md#资源格式参考)**。

---

## 支持平台

| 平台 | 状态 |
|----------|--------|
| Windows 11 | ✅ 首要目标（基于 Neutralinojs / WebView2 的透明悬浮层）|
| Linux（X11 / Wayland）| ✅（Neutralinojs / WebKitGTK；**需要合成器 + WebKitGTK**）|
| macOS | ⚠️ 渲染层已就绪；待打包运行时二进制 + 人工验证 |

悬浮层由 [Neutralinojs](https://neutralino.js.org) 渲染，它使用系统 webview（Windows 为 WebView2，Linux 为 WebKitGTK，macOS 为 WKWebView）。Linux 需要 `libwebkit2gtk`（GNOME/KDE 自带；轻量发行版可能需手动安装）以及一个运行中的合成器来提供逐像素透明。

---

## 配置

所有字段都可选，并用 Schemastery schema 校验（非法值会在加载时明确报错）。用户可编辑字段（`enabled`、`petScale`、`petId`、`hideWhenIdle`）会显示在 Web 设置卡片上。

| 字段 | 默认值 | 说明 |
|-------|---------|-------------|
| `enabled` | `true` | 总开关。 |
| `alwaysOnTop` | `true` | 让宠物置顶。 |
| `petScale` | `1` | 宠物大小，0.5–4 倍，步长 0.25。 |
| `petId` | `text` | 显示哪个宠物（即 `assets/pets/` 下的目录名）。 |
| `hideWhenIdle` | `false` | 宠物睡眠（无任务）时自动隐藏，有任务时重新显示。 |
| `animationEnabled` | `true` | 运行动画（为 false 时显示静态帧）。 |
| `idleFrequencySec` | `20` | 随机空闲动作间隔秒数（≥8）。 |
| `clickThrough` | `false` | 让指针事件穿透（Neutralino 不支持，加载时告警并忽略）。 |
| `startSleeping` | `false` | 以睡眠状态启动。 |
| `animationSpeed` | `1` | 全局速度倍率（0.25–4）。 |

示例：

```yaml
- insert:
    - id: desktop-pet
      name: dsh-desktop-pet
      config:
        petScale: 1
        petId: text
        idleFrequencySec: 30
```

窗口位置私下持久化在 `~/.dsh/desktop-pet/position.json`（尽力而为，失败忽略），不依赖任何 Harness 存储服务。

### 开发者模式

当核心的 `ctx.commands` 服务存在时，插件会注册一个 `/pet <state>` 命令，用于在不调用任何 LLM 的情况下模拟状态：

```text
/pet thinking
/pet working
/pet waiting_for_user
/pet success
/pet error
/pet reset
```

有效状态：`STARTING IDLE THINKING WORKING CODING RUNNING_COMMAND WAITING_FOR_USER SUCCESS ERROR SLEEPING`。

---

## 架构

```
harness 事件 / 生命周期
        ↓  （唯一的 harness 专属层）
integration/  HarnessBridge · capability-detection · event-mapping
        ↓  NormalizedEvent
core/         PetStateResolver · PetStateMachine · TaskStateRegistry
        ↓  SemanticState
renderer/     AnimationController · PetWindow
        ↓  帧指令（姿态 + 帧号）
renderer/backend/  NeutralinoBackend   （spawn Neutralino 运行时）
        ↓  WebSocket（官方 extension 协议）
assets/neutralino/  前端（canvas + 精灵图切片）
        ↑
renderer/codex-pet/  PetContract · PetLoader   （pet.json + 精灵图）
```

- **`HarnessBridge`** 是唯一了解原始 harness 事件名的模块，其上的所有内容都与 harness 无关。
- **宠物核心**（`core/`）是一个独立库：无需 harness、无需窗口、无需网络即可测试。
- **后端** 在 `WindowBackend` 之后做平台隔离；渲染器永远看不到平台细节。Neutralino 后端驱动一个加载精灵图并绘制帧的小前端——宿主只发送 `(姿态, 帧号)` 指令。
- **客户端半**（`src/client/`）是一个单独的浏览器 bundle，通过 harness 模块加载器注册；宿主半与客户端半通过 settings namespace 通信。

### Harness 依赖

只用到了 Cordis 插件生命周期和以下**核心**服务/事件：

- 插件入口：`apply(ctx, config)` + `name` / `inject` / `Config`。
- 生命周期：`ctx.effect()`、`ctx.on()`、`ctx.logger(name)`。
- 活动观察：`session/event`、`agent/status`。
- 设置：`desktop-pet` settings namespace（宿主侧），由客户端卡片绑定。
- 可选（探测、非必需）：`ctx.agents`、`ctx.sessions`、`ctx.approval`、`ctx.commands`。

不需要任何非核心插件。可选服务缺失时插件会优雅降级（状态更粗略、没有 `/pet` 命令）。

### 外部依赖

| 包 | 用途 | 运行时 |
|---------|---------|---------|
| `@deepseek-ai/schemastery` | 配置 schema 校验 | Node ≥22 |
| `clsx` | 客户端卡片的类名辅助（内联进浏览器 bundle）| 构建期 |

Peer（仅类型、不打包）：`@deepseek-ai/cordis`。

Neutralino 运行时二进制（以及 vendored 进 `assets/neutralino/resources/` 的 `@neutralinojs/lib` 客户端库）**不是**运行时 npm 依赖：二进制由 `postinstall` 脚本按当前平台下载到 `runtime/`（git 忽略），客户端库在构建期复制进包内 assets。`sharp` 仅作为 dev 依赖，供 `scripts/generate-assets.mjs` 构建占位宠物使用。

客户端 bundle 里的 `react` 和 `@deepseek-ai/dsh-client-*` 导入都是外部化的：它们由 harness 模块加载器在运行时提供，因此插件不会把它们作为运行时依赖发布（它们只作为 dev 依赖用于类型检查和打包）。

**明确避免**：Electron、Tauri、GLFW/SDL/raylib、游戏引擎、GPU/OpenGL、Docker、数据库、Redis、任何外部服务器、浏览器自动化。

### 事件 → 状态映射

| 归一化事件（来自 harness）| 宠物状态（语义 → 动画）|
|----------------------------------|----------------------------------|
| 启动 | `STARTING` → `waving` |
| 空闲（`agent/status: idle`）| `IDLE` → `idle` |
| `assistant/chunk`（text/reasoning/tool-call delta）| `THINKING` → `running` |
| `tool/call`（编辑类工具）| `CODING` → `running` |
| `tool/call`（shell/命令类工具）| `RUNNING_COMMAND` → `running` |
| `tool/call`（其它）| `WORKING` → `running` |
| `approval/asked` / 等待 | `WAITING_FOR_USER` → `waiting` |
| `turn/end` 原因 `completed` | `SUCCESS` → `review` |
| `turn/end` 原因 `error`/`aborted` | `ERROR` → `failed` |
| 长时间静默 | `SLEEPING` → `idle` |

`SUCCESS` / `ERROR` / `STARTING` 是临时状态（默认 2 秒）后回到 `IDLE`。并发 agent 按 session/task 分别跟踪，并按优先级 `WAITING_FOR_USER > ERROR > WORKING > THINKING > SUCCESS > IDLE` 合成。

### 扩展

- **添加宠物** —— 见 [添加宠物](docs/adding-a-pet.zh.md)；无需改代码。
- **添加动画状态** —— 在 `src/core/types.ts` 扩展 `SemanticState`，在 `src/core/PetStateResolver.ts` 扩展其解析映射，并在 `SEMANTIC_TO_CODEX` 扩展渲染姿态。
- **添加窗口后端** —— 实现 `WindowBackend`（`src/renderer/backend/WindowBackend.ts`）并在 `src/renderer/backend/selectBackend.ts` 注册。

---

## 测试

```sh
npm test                # vitest 单元测试（核心 + 加载器 + 集成）
npm run typecheck       # tsc --noEmit（宿主半）
npm run typecheck:client # tsc -p tsconfig.client.json --noEmit（客户端半）
npm run build           # tsdown 打包（宿主 + 客户端）
npm run gen:assets      # 重新生成内置的 text 宠物
```

宠物核心在无 harness、无显示环境的情况下测试。Neutralino 悬浮层需要真实桌面会话，**不**在无头测试套件中运行——需在 Windows/Linux 上人工验证。前端纯布局数学在宿主侧做单元测试。

---

## 发布

发布到 npm 已由 GitHub Actions 通过 **npm Trusted Publishing（OIDC）** 自动化：GitHub 签发 id token，npm 据此代表仓库发布，因此工作流**无需 `NODE_AUTH_TOKEN` secret**。向 `master` 推送 `v*` tag 会触发 `npm ci → typecheck → test → build → npm publish --provenance`。

**在 npm 上的一次性配置**（首次推送 tag 之前完成）：

1. 该包必须已存在于 npm。先用手动 token 发布一次 `0.1.0`（`npm publish --access public`）——Trusted Publishing 是按包配置的，所以必须先有 npmjs 包页面。
2. 在 npmjs 包页面启用 **Trusted Publishing** 并授权本仓库：owner `sereinmono`、repository `dsh-desktop-pet`。若表单允许，可将 workflow 固定为 `publish.yml`、分支固定为 `master`。

**本地发布** —— 提升版本、打 tag 并推送 tag：

```sh
npm version patch   # 或 minor / major；会创建 vX.Y.Z tag
git push origin master --tags
```

工作流只在 tag 指向的提交位于 `master` 上时发布；其他分支的 tag 会被跳过。手动备份入口在 Actions → Publish → Run workflow（该 tag 仍须位于 `master`）。

---

## 已知限制

- **Linux 需要 WebKitGTK + 合成器**；轻量发行版可能需手动安装 `libwebkit2gtk-4.0`。
- **macOS 尚未验证** —— 渲染层是平台无关的，安装器也已打包运行时二进制，但尚未人工测试。
- **点击穿透不受支持**：Neutralino 透明窗口没有逐窗口的指针穿透 API，因此 `clickThrough` 被忽略（告警提示）。
- **透明窗口死区**（Windows）：Neutralino 透明窗口底部约 20% 区域收不到指针输入（上游 [neutralinojs#1482](https://github.com/neutralinojs/neutralinojs/issues/1482)）。宠物被绘制在窗口顶部 75% 区域内，以保证拖动/悬停/点击完全可用。
- 内置占位宠物只有 `text` 测试宠物——纯 SVG 绘制的文字，不含 OpenAI/Codex/DeepSeek 的角色美术或商标。
- 悬浮层渲染（无边框/透明/置顶/拖动）尚未被自动化 CI 覆盖，需在真实桌面上人工检查。

---

## License

MIT.
