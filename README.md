# DeepAgents - 深度检索平台

基于 **LangGraph + DeepAgents** 的多智能体协作系统，具备联网搜索、数据库查询、RAGFlow 知识库检索与文档自动生成能力。前端为 React + Tailwind CSS 构建的现代化聊天界面。

## 项目结构

```
deep_agent/
├── deep_agent_project/          # Python 后端（核心）
│   ├── agent/                   # 智能体定义
│   │   ├── main_agent.py        # 主智能体：任务编排与执行引擎
│   │   ├── llm.py               # 大语言模型初始化
│   │   ├── prompts.py           # 提示词配置加载
│   │   ├── yaml_load.py         # YAML 配置加载（备用）
│   │   └── sub_agents/
│   │       ├── network_search_agent.py     # 网络搜索助手
│   │       ├── database_query_agent.py     # 数据库查询助手
│   │       └── knowledge_base_agent.py     # RAGFlow 知识库助手
│   ├── api/                     # FastAPI Web 服务
│   │   ├── server.py            # API 路由（任务/上传/下载/WebSocket）
│   │   ├── monitor.py           # 实时事件监控（WebSocket 推送）
│   │   ├── context.py           # ContextVar 上下文隔离
│   │   └── task_manager.py      # 任务生命周期管理
│   ├── tools/                   # Agent 工具集
│   │   ├── tavily_tools.py      # Tavily 联网搜索工具
│   │   ├── mysql_tools.py       # MySQL 数据库查询工具
│   │   ├── ragflow_tools.py     # RAGFlow 知识库交互工具
│   │   ├── markdown_tools.py    # Markdown 文档生成工具
│   │   ├── pdf_tools.py         # Markdown → PDF 转换工具
│   │   └── upload_file_read_tool.py  # 上传文件内容读取工具
│   ├── ragflow/                 # RAGFlow 配置
│   │   ├── config.py
│   │   └── rag_flow.py
│   ├── prompt/
│   │   └── prompts.yml          # 智能体提示词配置文件
│   ├── utils/                   # 工具类
│   │   ├── safe_io.py           # Windows UTF-8 控制台编码兼容
│   │   ├── path_utils.py        # 路径解析工具
│   │   └── word_converter.py    # Word COM 引擎 PDF 转换
│   ├── output/                  # 会话输出文件目录
│   ├── updated/                 # 用户上传文件暂存区
│   ├── requirements.txt
│   ├── start_server.ps1         # 后端启动脚本
│   └── .env                     # 环境变量配置（API Key 等）
├── agents_projects/             # 独立实验/原型脚本
│   └── base/
│       ├── deepagent_01.py ~ 09.py  # 系列原型迭代
│       └── tavily_tool.py
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── app/App.tsx          # 主应用组件（聊天/进度/文件面板）
│   │   ├── api/agent.ts         # 后端 API 调用封装
│   │   ├── lib/request.ts       # HTTP 请求工具
│   │   └── styles/              # 样式文件
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── README.md
├── ragflow/                     # RAGFlow 独立模块
└── start_all.ps1                # 一键启动（后端 + 前端）
```

## 架构设计

### 多智能体协作

系统采用 **LangGraph** 的 `create_deep_agent` 工厂方法构建，由 **1 个主智能体 + 3 个子智能体** 组成：

| 组件 | 职责 | 工具 |
|---|---|---|
| **主智能体** | 任务拆解、协调子智能体、生成最终文档 | `generate_markdown`、`convert_md_to_pdf`、`read_file_content` |
| **网络搜索助手** | 互联网公开信息检索 | `internet_search`（Tavily API） |
| **数据库查询助手** | MySQL 业务数据查询 | `list_sql_tables`、`get_table_data`、`execute_sql_query` |
| **RAGFlow 助手** | 企业内部知识库问答 | `get_assistant_list`、`create_ask_delete` |

### 工作流程

```
用户输入 → 主智能体拆解任务
         ├─→ 网络搜索助手（获取外部信息）
         ├─→ 数据库查询助手（查询业务数据）
         ├─→ RAGFlow 助手（内部知识检索）
         └─→ 汇总结果 → 生成 Markdown/PDF 文档
```

### 实时通信架构

```
FastAPI Server
  ├─ HTTP REST API（任务提交/文件上传下载）
  ├─ WebSocket（实时进度推送 /ws/{thread_id}）
  └─ ContextVar 隔离（支持并发会话）
```

## 技术栈

| 类别 | 技术 |
|---|---|
| **后端框架** | Python 3.10+, FastAPI, Uvicorn |
| **AI 框架** | LangChain, LangGraph, DeepAgents SDK |
| **大模型** | 兼容 OpenAI 协议（通义千问 Qwen 系列等） |
| **前端** | React 18, TypeScript, Vite, Tailwind CSS 4 |
| **数据库** | MySQL 8.0+ |
| **知识库** | RAGFlow |
| **搜索** | Tavily Search API |
| **文档生成** | Markdown / PDF（通过 Microsoft Word COM 引擎） |

## 环境要求

- **Python** 3.10+
- **Node.js** >= 18（推荐 22+）
- **MySQL** 8.0+（若需数据库查询功能）
- **Microsoft Word**（若需 PDF 生成功能，依赖 COM 接口）
- **操作系统**：Windows（推荐；依赖 Win32 COM 进行 PDF 转换）

## 快速开始

### 1. 克隆项目

```bash
git clone <repo-url>
cd deep_agent
```

### 2. 后端配置

```bash
cd deep_agent_project

# 创建虚拟环境
python -m venv .venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 3. 配置环境变量

编辑 `deep_agent_project/.env`，填入必要的 API Key：

```env
# LLM 配置（兼容 OpenAI 协议）
OPENAI_BASE_URL=https://your-llm-api.com/v1
OPENAI_API_KEY=sk-your-api-key
LLM_QWEN_MAX=gpt-4o-mini   # 模型名称

# Tavily 搜索 API（https://app.tavily.com）
TAVILY_API_KEY=tvly-your-api-key

# MySQL 数据库（可选）
MYSQL_USER=root
MYSQL_PASSWORD=your-password
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=your_database

# RAGFlow 知识库（可选）
RAGFLOW_API_URL=http://your-ragflow-server
RAGFLOW_API_KEY=ragflow-your-api-key
```

### 4. 安装前端依赖

```bash
cd frontend
npm install
```

### 5. 启动服务

**方式一：一键启动（推荐）**

```powershell
# Windows PowerShell
.\start_all.ps1
```

**方式二：分别启动**

```bash
# 终端 1：启动后端 API（端口 8000）
cd deep_agent_project
.\start_server.ps1

# 终端 2：启动前端（端口 5173）
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

### 6. 访问平台

打开浏览器访问 **http://127.0.0.1:5173/**

后端 API 文档：http://127.0.0.1:8000/docs

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/task` | 提交任务（返回 `thread_id`） |
| `POST` | `/api/task/stop` | 停止指定任务 |
| `POST` | `/api/task/stop-all` | 停止所有任务 |
| `POST` | `/api/task/pause` | 暂停指定任务 |
| `POST` | `/api/task/resume` | 恢复指定任务 |
| `GET` | `/api/task/running` | 获取运行中任务列表 |
| `POST` | `/api/upload` | 上传文件 |
| `GET` | `/api/download` | 下载文件 |
| `GET` | `/api/files` | 获取文件列表 |
| `WS` | `/ws/{thread_id}` | WebSocket 实时事件推送 |

## 使用场景

- **数据问答**：查询 MySQL 业务数据，如"药品销售排名前10的品种"
- **报告生成**：结合多个数据源自动生成 Markdown/PDF 分析报告
- **联网搜索**：搜索最新行业动态并总结
- **知识库检索**：从 RAGFlow 内部知识库获取企业文档信息
- **文件分析**：上传并分析 MD/DOCX/PDF/Excel 等文件

## 开发说明

- **提示词配置**：编辑 `deep_agent_project/prompt/prompts.yml`
- **主智能体逻辑**：`deep_agent_project/agent/main_agent.py`
- **新建子智能体**：在 `agent/sub_agents/` 目录下创建，注册工具，并在 `prompts.yml` 中配置提示词
- **上下文隔离**：基于 `contextvars` 实现，支持并发会话互不干扰
- **流式输出**：主智能体通过 LangGraph `astream` 逐段输出，WebSocket 实时推送到前端
