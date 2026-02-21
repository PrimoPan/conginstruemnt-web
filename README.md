# CogInstrument Web (`conginstrument-web`)

Language / 语言：
[中文](#中文) | [English](#english)

---

## 中文

### 1. 工程目的

`conginstrument-web` 是 CogInstrument 的前端可视化客户端，负责：

1. 用户登录与新建会话。
2. 左侧聊天（流式 token 实时显示）。
3. 右侧 CDG 流程图渲染（React Flow）。
4. 可编辑流程图（节点参数、边类型、拖拽重挂父子关系）。
5. 节点 hover 反向高亮聊天证据片段。
6. 与后端接口的类型对齐与协议消费（JSON + SSE）。

这是一个人机协同系统前端，不只是聊天 UI。

---

### 2. 技术栈

- React 19 + TypeScript
- Create React App（`react-scripts`）
- `@xyflow/react`（React Flow）
- 浏览器原生 Fetch + SSE 文本流解析

---

### 3. 快速启动

```bash
npm install
npm start
```

默认开发地址：`http://localhost:3000`

构建：

```bash
npm run build
```

---

### 4. 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `REACT_APP_API_BASE_URL` | 否 | 空（同源） | 单一后端地址，兼容旧配置 |
| `REACT_APP_API_BASE_URLS` | 否 | 空 | 多后端地址（逗号分隔），例如 `http://127.0.0.1:3001,https://api.example.com` |

建议：

- 生产同机部署（前端 `:6688` + 反向代理 `/api`）时，前端可不配地址，默认走同源，基本不需要跨域。
- 本地实验多后端时，配置 `REACT_APP_API_BASE_URLS`。
- 可通过 URL 查询参数临时切换：`?apiBase=https://your-backend`（会写入 `localStorage`，键名 `cg.apiBase`）。

本地示例：

```bash
REACT_APP_API_BASE_URLS=http://127.0.0.1:3001,http://43.138.212.17:3001
```

---

### 5. 运行行为与页面布局

页面由三部分组成：

1. 顶栏：用户名输入、登录、新建对话、会话 ID 与图版本。
2. 左侧：聊天区（独立滚动，输入区固定底部）。
3. 右侧：流程图区（固定视口高度，不跟随聊天内容拉长）。

交互要点：

- 发送消息时走 SSE 接口，`token` 事件逐步刷新 assistant 文本。
- `done` 到达后更新整张图。
- 生成新图期间，右侧标题显示：`意图分析图生成中`。
- 鼠标 hover 流程图节点时，左侧聊天会高亮证据词（`evidenceIds`）。
- 右上角“保存并生成建议”会把前端完整编辑图写回后端，并可选触发“基于新图”的建议生成。
- 工具栏支持新增节点；删除时默认仅删除“当前节点”，并自动将其子节点重连到父节点（避免整棵子树被删）。
- 点击节点后在右上 `Inspector` 编辑主要参数：`statement/type/layer/status/strength/severity/confidence/importance/tags/evidenceIds/sourceMsgIds/key/value`。
- 点击边后会出现“边类型”下拉，可改为 `enable/constraint/determine/conflicts_with`。
- 拖拽节点并释放到另一个节点附近，会重挂为其子节点（默认新增 `enable` 边，且自动避免成环）。
- 节点卡片改为“纯展示”，编辑入口统一在右上 `Inspector`，避免编辑与拖拽冲突。
- 节点支持整卡拖拽；拖拽后坐标会写入节点 `value.ui.{x,y}`，并自动防抖同步到后端（`requestAdvice=false`），避免位置丢失。
- 布局按 `destination(city)` 与 `duration_city(city)` 家族分组，同层目的地（如米兰/巴塞）并列展示。
- `status=rejected` 且低重要度的旧槽位节点默认隐藏，减少历史噪声堆积。

---

### 6. 与后端的接口契约

主要由 `src/api/client.tsx` 与 `src/core/type.ts` 定义和消费：

- `POST /api/auth/login`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
- `PUT /api/conversations/:id/graph`（保存前端修改后的图，可选请求建议）
- `GET /api/conversations/:id/turns`
- `POST /api/conversations/:id/turn`
- `POST /api/conversations/:id/turn/stream`（SSE）

SSE 事件：

- `start`：会话与版本信息
- `token`：增量文本
- `ping`：心跳
- `done`：最终输出（`assistantText + graphPatch + graph`）
- `error`：错误信息

---

### 7. 前端核心模块

1. `App.tsx`：全局状态编排（token/cid/messages/graph/busy），串联 TopBar + Chat + Flow。
2. `api/client.tsx`：统一 API 调用和 SSE 解析入口。
3. `core/type.ts`：与后端 CDG/patch/turn 的核心类型契约。
4. `core/graphToFlow.tsx`：把后端 CDG 映射成 React Flow 节点与边（分层布局、非法边过滤、meeting/language/generic constraint 槽位映射）。
5. `core/graphSafe.ts`：前端入站 graph 快照容错归一化（首轮/异常数据兜底）。
5. `components/ChatPanel.tsx`：聊天渲染 + 输入 + 证据高亮。
6. `components/FlowPanel.tsx`：流程图主编排（草稿图状态、选中状态、增删保存、拖拽落位重挂）。
7. `components/CdgFlowNode.tsx`：自定义节点卡片（纯展示）。
8. `components/flow/FlowCanvas.tsx`：React Flow 画布层（渲染、hover、高亮回传）。
9. `components/flow/FlowToolbar.tsx`：工具栏（新增、保存、状态）。
10. `components/flow/FlowInspector.tsx`：右上编辑面板（节点/边参数、单节点删除与重连）。
11. `components/flow/graphDraftUtils.ts`：草稿图辅助函数（ID、环检测、删除后重连、位置写回）。

---

### 8. 文件结构与逐文件说明

#### 8.1 目录树

```text
conginstrument-web/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ README.md
├─ public/
│  ├─ favicon.ico
│  ├─ index.html
│  ├─ logo192.png
│  ├─ logo512.png
│  ├─ manifest.json
│  └─ robots.txt
└─ src/
   ├─ App.tsx
   ├─ App.css
   ├─ App.test.tsx
   ├─ index.tsx
   ├─ index.css
   ├─ logo.svg
   ├─ react-app-env.d.ts
   ├─ reportWebVitals.ts
   ├─ setupTests.ts
   ├─ api/
   │  ├─ client.tsx
   │  ├─ turnStream.ts
   │  └─ sseTurn.ts
   ├─ core/
   │  ├─ type.ts
   │  └─ graphToFlow.tsx
   └─ components/
      ├─ TopBar.tsx
      ├─ ChatPanel.tsx
      ├─ FlowPanel.tsx
      ├─ CdgFlowNode.tsx
      └─ flow/
         ├─ FlowCanvas.tsx
         ├─ FlowToolbar.tsx
         ├─ FlowInspector.tsx
         └─ graphDraftUtils.ts
```

#### 8.2 根目录文件

| 文件 | 作用 |
| --- | --- |
| `README.md` | 前端说明文档（本文件） |
| `package.json` | 依赖与脚本（start/build/test） |
| `package-lock.json` | npm 锁版本 |
| `tsconfig.json` | TypeScript 编译配置 |

#### 8.3 `public/` 文件

| 文件 | 作用 |
| --- | --- |
| `public/index.html` | SPA HTML 模板，挂载 `#root` |
| `public/favicon.ico` | 浏览器标签图标 |
| `public/logo192.png` | PWA 图标（192） |
| `public/logo512.png` | PWA 图标（512） |
| `public/manifest.json` | Web App Manifest |
| `public/robots.txt` | 爬虫策略 |

#### 8.4 `src/` 基础文件

| 文件 | 作用 |
| --- | --- |
| `src/index.tsx` | React 应用入口，挂载 `App` |
| `src/App.tsx` | 页面主容器，状态与事件编排 |
| `src/App.css` | 全局布局与组件样式（含双栏滚动约束） |
| `src/index.css` | CRA 基础样式 |
| `src/logo.svg` | 默认 logo 资源 |
| `src/react-app-env.d.ts` | CRA TypeScript 环境声明 |
| `src/reportWebVitals.ts` | 性能指标上报入口 |
| `src/setupTests.ts` | Jest 测试初始化 |
| `src/App.test.tsx` | 基础测试样例 |

#### 8.5 `src/api/` 文件

| 文件 | 作用 |
| --- | --- |
| `src/api/client.tsx` | 当前主 API 客户端（JSON + SSE + 事件回调） |
| `src/api/turnStream.ts` | 早期/备用 SSE 解析实现（当前默认未被 App 引用） |
| `src/api/sseTurn.ts` | 另一版 SSE helper（当前默认未被 App 引用） |

#### 8.6 `src/core/` 文件

| 文件 | 作用 |
| --- | --- |
| `src/core/type.ts` | 与后端对齐的类型定义（CDG、patch、turn、SSE data） |
| `src/core/graphToFlow.tsx` | CDG -> React Flow 节点/边转换、层次布局、样式映射（含低重要度 rejected 节点隐藏） |
| `src/core/graphSafe.ts` | 规范化后端返回的 graph 快照，防止首轮渲染因脏数据报错 |

#### 8.7 `src/components/` 文件

| 文件 | 作用 |
| --- | --- |
| `src/components/TopBar.tsx` | 顶栏：登录、新建会话、CID/version 展示 |
| `src/components/ChatPanel.tsx` | 聊天窗口、输入发送、证据高亮与自动滚动 |
| `src/components/FlowPanel.tsx` | 图编辑主控：草稿状态、选中状态、拖拽落位、保存联动 |
| `src/components/CdgFlowNode.tsx` | 自定义节点卡片（展示态） |
| `src/components/flow/FlowCanvas.tsx` | React Flow 画布层与交互事件桥接 |
| `src/components/flow/FlowToolbar.tsx` | 新增节点、保存、脏状态与生成状态展示 |
| `src/components/flow/FlowInspector.tsx` | 右上编辑面板，支持删“当前节点并重连上下游” |
| `src/components/flow/graphDraftUtils.ts` | 图编辑工具函数（防环、删除后重连、位置写回） |

---

### 9. 类型对齐（协作重点）

前后端以以下文件为“协议真源”：

- 后端：`conginstrument/src/core/graph.ts`
- 前端：`conginstrument-web/src/core/type.ts`

当前节点还包含语义层级字段：`layer = intent | requirement | preference | risk`，
用于在前端卡片中直接显示四层分类并支持后续论文导向扩展。

协作规范：

1. 改图结构先改后端类型，再同步前端类型。
2. SSE 事件字段变更时，必须同步 `src/api/client.tsx` 解析器。
3. 新增节点字段时，同时考虑：
   - 节点渲染（`CdgFlowNode.tsx`）
   - 布局与排序（`graphToFlow.tsx`）
   - 证据回溯（`ChatPanel.tsx`）

---

### 10. 常见调试点

1. “有聊天但图不更新”：先看 `done` 事件里是否含 `graph`。
2. “SSE 断流”：检查后端 `Content-Type` 与代理是否缓冲。
3. “布局被聊天撑高”：检查 `App.css` 中 `App/Main/Left/Right` 的 `min-height:0 + overflow:hidden`。
4. “证据高亮无效”：确认节点带有 `evidenceIds` 或 `sourceMsgIds`。
5. “保存后没有建议”：检查 `PUT /graph` 请求是否带 `requestAdvice=true`，以及后端返回的 `assistantText/adviceError`。

---

## English

### 1. Purpose

`conginstrument-web` is the frontend client for CogInstrument. It provides:

1. Login + conversation creation.
2. Left chat panel with streaming tokens.
3. Right CDG visualization (React Flow).
4. Editable graph UI (node fields, edge type, drag-to-reparent).
5. Node-hover evidence highlighting back in chat.
6. Type-aligned protocol consumption from backend (JSON + SSE).

---

### 2. Stack

- React 19 + TypeScript
- Create React App (`react-scripts`)
- `@xyflow/react`
- Fetch + custom SSE parsing

---

### 3. Run

```bash
npm install
npm start
```

Build:

```bash
npm run build
```

Optional env:

- `REACT_APP_API_BASE_URL` (single backend base, default: same-origin)
- `REACT_APP_API_BASE_URLS` (comma-separated backend list, optional)
- Runtime override: `?apiBase=https://your-backend` (persisted in `localStorage` as `cg.apiBase`)

---

### 4. API contract

Used endpoints:

- `POST /api/auth/login`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
- `PUT /api/conversations/:id/graph` (supports `requestAdvice` + `advicePrompt`)
- `GET /api/conversations/:id/turns`
- `POST /api/conversations/:id/turn`
- `POST /api/conversations/:id/turn/stream` (SSE)

SSE events consumed by frontend:

- `start`, `token`, `ping`, `done`, `error`

---

### 5. File map

```text
src/App.tsx                 # app state orchestration
src/components/TopBar.tsx   # top toolbar
src/components/ChatPanel.tsx# chat UI + evidence highlighting
src/components/FlowPanel.tsx# flow panel + add/delete subtree + edge edit + save/advice trigger
src/components/CdgFlowNode.tsx # custom editable node card (handle-only drag)
src/core/type.ts            # shared protocol types
src/core/graphToFlow.tsx    # CDG -> Flow mapping/layout
src/core/graphSafe.ts       # incoming graph snapshot normalizer (runtime safety)
src/api/client.tsx          # primary API/SSE client
src/api/turnStream.ts       # legacy/backup stream helper
src/api/sseTurn.ts          # legacy/backup stream helper
```

---

### 6. Collaboration notes

- Keep `src/core/type.ts` aligned with backend `src/core/graph.ts`.
- When changing SSE payload fields, update `src/api/client.tsx` parser immediately.
- When adding new node attributes, update rendering (`CdgFlowNode.tsx`) and layout (`graphToFlow.tsx`) together.
- Node taxonomy now includes `layer = intent | requirement | preference | risk`; keep this field aligned with backend schema.
