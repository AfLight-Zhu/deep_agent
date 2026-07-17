# DeepAgents 问数平台 - 前端开发说明

> 本文档由后端 Python 代码整理，供 Figma / Figma Make 生成前端使用。

## 产品概述

沃华医药智能问数平台。用户输入自然语言问题，系统后台调用多个 AI 助手（网络搜索、数据库查询、知识库检索）协同完成任务，并通过 WebSocket 实时推送进度，最终可生成 Markdown / PDF 文件。

**后端地址：** `http://127.0.0.1:8000`

---

## 页面结构建议

### 1. 主对话页
- 顶部：产品标题 + 当前会话状态
- 中部：消息列表（用户问题 + AI 最终回复）
- 底部：输入框 + 发送按钮 + 文件上传按钮

### 2. 实时进度侧栏
- 展示 WebSocket 推送的执行状态
- 事件类型：工具调用、子助手调用、任务完成

### 3. 文件区
- 上传文件列表（关联当前 thread_id）
- 生成结果文件列表（支持下载）

### 4. 会话管理（可选）
- 每个任务对应一个 thread_id
- 支持新建会话 / 切换会话

---

## 核心交互流程

```
1. 用户输入问题
2. POST /api/task → 获得 thread_id
3. 同时建立 WebSocket: ws://127.0.0.1:8000/ws/{thread_id}
4. 侧栏实时显示进度消息
5. 收到 task_result 事件 → 在对话区展示最终结果
6. GET /api/files → 刷新生成文件列表
7. GET /api/download?path=xxx → 下载文件
```

**文件上传流程（可选，任务前或任务中）：**
```
1. 先获得 thread_id（可先调 /api/task 或前端生成 UUID）
2. POST /api/upload，form-data: files + thread_id
3. 再发送带文件上下文的问题
```

---

## HTTP 接口

### POST /api/task — 启动任务

**请求体 (JSON):**
```json
{
  "query": "帮我查一下空调销量排名前10的商品",
  "thread_id": "可选，不传则服务端自动生成 UUID"
}
```

**响应:**
```json
{
  "status": "started",
  "thread_id": "0e278482-34ca-4ab5-a2cb-e95e73e2232a"
}
```

---

### POST /api/upload — 上传文件

**请求体 (multipart/form-data):**
| 字段 | 类型 | 说明 |
|------|------|------|
| files | File[] | 支持多文件 |
| thread_id | string | 会话 ID，必填 |

**响应:**
```json
{
  "status": "uploaded",
  "files": ["report.pdf", "data.xlsx"]
}
```

---

### GET /api/files — 列出输出文件

**Query 参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | output 目录下的绝对路径 |

**响应:**
```json
{
  "files": [
    {
      "name": "report.md",
      "type": "file",
      "path": "E:/.../output/session_xxx/report.md",
      "size": 12345,
      "mtime": 1710000000.0
    }
  ]
}
```

**错误响应:**
```json
{ "error": "目录不存在" }
```

---

### GET /api/download — 下载文件

**Query 参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | 从 /api/files 返回的 path 字段 |

**响应:** 文件二进制流（浏览器触发下载）

**错误响应:**
```json
{ "error": "文件不存在" }
```

---

## WebSocket 接口

**连接地址:** `ws://127.0.0.1:8000/ws/{thread_id}`

### 客户端 → 服务端
发送纯文本心跳，例如：`ping`

### 服务端 → 客户端

**心跳响应:**
```json
{
  "type": "pong",
  "message": "服务端已收到: ping"
}
```

**进度推送 (monitor_event):**
```json
{
  "type": "monitor_event",
  "event": "tool_start",
  "message": "开始执行工具: list_sql_tables",
  "data": {
    "tool_name": "list_sql_tables",
    "args": {}
  },
  "timestamp": "2026-07-11T20:00:00.000000"
}
```

### event 类型一览

| event | 含义 | 前端展示建议 |
|-------|------|-------------|
| tool_start | 工具开始执行 | 显示工具名称 + loading |
| assistant_call | 调用子助手 | 显示「网络搜索助手 / 数据库查询助手 / RAGFlow助手」 |
| session_created | 工作目录创建 | 可忽略或显示「任务初始化」 |
| task_result | 任务完成 | 展示 data.result 到对话区 |

**task_result 示例:**
```json
{
  "type": "monitor_event",
  "event": "task_result",
  "message": "任务执行完成",
  "data": {
    "result": "根据数据库查询，销量前10的空调商品是..."
  },
  "timestamp": "2026-07-11T20:05:00.000000"
}
```

---

## 业务能力（供 UI 文案参考）

系统包含 1 个主助手 + 3 个子助手：

| 助手 | 能力 |
|------|------|
| 主助手 | 协调任务、生成 Markdown/PDF 文档 |
| 网络搜索助手 | 互联网公开信息检索 |
| 数据库查询助手 | MySQL 商品数据查询（空调等） |
| RAGFlow助手 | 企业内部知识库问答 |

用户可：
- 直接提问获取文字回答
- 上传 .md / .docx / .pdf / .xlsx 文件供分析
- 要求生成 Markdown 或 PDF 报告

---

## 技术约束

- CORS 已开放，前端可用任意端口开发
- 无登录鉴权，暂不需要 Token
- 前端技术栈建议：React + TypeScript
- WebSocket 需在获得 thread_id 后立即连接
- 文件 path 使用后端返回的绝对路径，不要自行拼接

---

## 设计风格建议

- 企业级 B 端风格，偏专业、简洁
- 主色建议：深蓝 + 白色
- 进度侧栏用步骤条或时间线展示
- 对话区支持 Markdown 渲染
- 移动端非必须，优先桌面端
