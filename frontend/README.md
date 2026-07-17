# deepagent 前端

基于 Vite + React + Tailwind CSS 的前端项目。原始设计稿见 [Figma - deepagent](https://www.figma.com/design/phrtFkmsyu0ZnbwUAe1b5D/deepagent)。

## 项目路径

```
deepagent_v1/frontend/
```

完整路径示例（Windows）：

```
E:\20260409project\项目展示\deepagent_v1\frontend
```

## 环境要求

- **Node.js** >= 18（已在 Node.js v22.22.0 下验证）
- **包管理器**：推荐使用 **npm**（Windows 本地开发）

> **说明**：项目内含 `pnpm-workspace.yaml`，其中 `supportedArchitectures` 仅配置了 Linux。在 Windows 上使用 `pnpm install` 可能无法正确安装 `@rollup/rollup-win32-x64-msvc` 等原生依赖，导致 `pnpm run dev` 启动失败。本地 Windows 环境请使用下方 **npm** 命令。

## 安装依赖

在 **frontend 目录** 下执行：

```bash
cd frontend
npm install
```

## 启动开发服务器

```bash
npm run dev
```

启动成功后，在浏览器访问：

```
http://localhost:5173/
```

## 生产构建（可选）

```bash
npm run build
```

构建产物输出至 `frontend/dist/` 目录。

## 常用命令汇总

| 命令 | 说明 |
|------|------|
| `npm install` | 安装项目依赖 |
| `npm run dev` | 启动 Vite 开发服务器（默认端口 5173） |
| `npm run build` | 构建生产版本 |

## 本地验证记录

- 依赖安装：`npm install` — 成功（384 packages）
- 开发启动：`npm run dev` — 成功，HTTP 200 @ http://localhost:5173/
- 生产构建：`npm run build` — 成功，产物位于 `dist/`
