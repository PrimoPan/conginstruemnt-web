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
4. 节点 hover 反向高亮聊天证据片段。
5. 与后端接口的类型对齐与协议消费（JSON + SSE）。

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
| `REACT_APP_API_BASE_URL` | 否 | `http://43.138.212.17:3001` | 后端 API 基地址 |

建议本地调试时设置为你的后端地址，例如：

```bash
REACT_APP_API_BASE_URL=http://localhost:3001
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
- 鼠标 hover 流程图节点时，左侧聊天会高亮证据词（`evidenceIds`）。

---

### 6. 与后端的接口契约

主要由 `src/api/client.tsx` 与 `src/core/type.ts` 定义和消费：

- `POST /api/auth/login`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
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
4. `core/graphToFlow.tsx`：把后端 CDG 映射成 React Flow 节点与边（分层布局）。
5. `components/ChatPanel.tsx`：聊天渲染 + 输入 + 证据高亮。
6. `components/FlowPanel.tsx`：React Flow 容器与节点 hover 事件。
7. `components/CdgFlowNode.tsx`：节点卡片 UI、风险/重要度展示、展开细节。

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
      └─ CdgFlowNode.tsx
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
| `src/core/graphToFlow.tsx` | CDG -> React Flow 节点/边转换、层次布局、样式映射 |

#### 8.7 `src/components/` 文件

| 文件 | 作用 |
| --- | --- |
| `src/components/TopBar.tsx` | 顶栏：登录、新建会话、CID/version 展示 |
| `src/components/ChatPanel.tsx` | 聊天窗口、输入发送、证据高亮与自动滚动 |
| `src/components/FlowPanel.tsx` | React Flow 容器、节点 hover -> 证据 focus 回调 |
| `src/components/CdgFlowNode.tsx` | 自定义节点卡片（风险色、重要度、展开/编辑细节） |

---

### 9. 类型对齐（协作重点）

前后端以以下文件为“协议真源”：

- 后端：`conginstrument/src/core/graph.ts`
- 前端：`conginstrument-web/src/core/type.ts`

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

---

## English

### 1. Purpose

`conginstrument-web` is the frontend client for CogInstrument. It provides:

1. Login + conversation creation.
2. Left chat panel with streaming tokens.
3. Right CDG visualization (React Flow).
4. Node-hover evidence highlighting back in chat.
5. Type-aligned protocol consumption from backend (JSON + SSE).

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

- `REACT_APP_API_BASE_URL` (default: `http://43.138.212.17:3001`)

---

### 4. API contract

Used endpoints:

- `POST /api/auth/login`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
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
src/components/FlowPanel.tsx# react-flow panel
src/components/CdgFlowNode.tsx # custom node card
src/core/type.ts            # shared protocol types
src/core/graphToFlow.tsx    # CDG -> Flow mapping/layout
src/api/client.tsx          # primary API/SSE client
src/api/turnStream.ts       # legacy/backup stream helper
src/api/sseTurn.ts          # legacy/backup stream helper
```

---

### 6. Collaboration notes

- Keep `src/core/type.ts` aligned with backend `src/core/graph.ts`.
- When changing SSE payload fields, update `src/api/client.tsx` parser immediately.
- When adding new node attributes, update rendering (`CdgFlowNode.tsx`) and layout (`graphToFlow.tsx`) together.

