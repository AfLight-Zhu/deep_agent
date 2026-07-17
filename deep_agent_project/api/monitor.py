import datetime
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import WebSocket
from api.context import get_thread_context
from utils.safe_io import bootstrap_encoding, safe_print

bootstrap_encoding()

# 尝试导入全局运行时（用于脚本模式下的流式输出）
try:
    import builtins
except ImportError:
    builtins = None


class ToolMonitor:
    """
    工具监控类，用于在工具执行过程中上报进度和状态。
    设计为单例模式，可在任何工具中直接导入使用。
    兼容 FastAPI WebSocket 和 脚本运行时的 stream_writer。

    使用示例:
    from api.monitor import monitor

    def my_tool(arg1):
        monitor.report_start("my_tool", {"arg1": arg1})
        ...
        monitor.report_running("my_tool", "正在处理数据...", progress=0.5)
        ...
        monitor.report_end("my_tool", result)
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ToolMonitor, cls).__new__(cls)
            cls._instance.websocket_manager = None  # 预留给 FastAPI WebSocketManager
            cls._instance._run_markdown_files: Dict[str, List[str]] = {}
        return cls._instance

    def set_websocket_manager(self, manager):
        """设置 FastAPI 的 WebSocket 管理器"""
        self.websocket_manager = manager

    def _emit(self, event_type: str, message: str, data: Optional[Dict[str, Any]] = None):
        """内部发送方法"""
        payload = {
            "type": "monitor_event",
            "event": event_type,
            "message": message,
            "data": data or {},
            "timestamp": datetime.datetime.now().isoformat()
        }

        # 1. 优先尝试通过 FastAPI WebSocket 发送 (定向推送)
        if self.websocket_manager:
            try:
                # 获取当前线程 ID
                thread_id = get_thread_context()

                # 确保 loop 已加载
                manager_loop = self.websocket_manager.get_loop()

                if manager_loop:
                    if thread_id:
                        # 检查当前是否在同一个事件循环中
                        try:
                            current_loop = asyncio.get_running_loop()
                        except RuntimeError:
                            current_loop = None

                        if current_loop and current_loop == manager_loop:
                            # 如果在同一个循环中（例如在 create_task 中运行），直接创建任务
                            current_loop.create_task(
                                self.websocket_manager.send_to_thread(payload, thread_id)
                            )
                        else:
                            # 如果在不同线程，使用 threadsafe 方法
                            asyncio.run_coroutine_threadsafe(
                                self.websocket_manager.send_to_thread(payload, thread_id),
                                manager_loop
                            )
                    else:
                        # 如果没有 thread_id，说明可能是系统级消息，或者未上下文环境
                        pass
            except Exception as e:
                safe_print(f"[Monitor] WebSocket send failed: {e}")

        # 2. 尝试通过全局 runtime 输出 (DeepAgents 脚本模式)
        # 这使得 simple_agents.py 中的 MockRuntime 能接收到数据
        if builtins and hasattr(builtins, 'runtime') and hasattr(builtins.runtime, 'stream_writer'):
            try:
                builtins.runtime.stream_writer(payload)
            except Exception:
                pass

        # 3. 控制台保底输出 (方便调试)
        # 加上特殊前缀，方便肉眼识别
        safe_print(f"\n[Monitor:{event_type}] {message}")

    def report_tool(self, tool_name: str, args: Dict[str, Any] = None):
        """报告工具开始执行"""
        self._emit("tool_start", f"开始执行工具: {tool_name}", {"tool_name": tool_name, "args": args})

    def report_tool_end(self, tool_name: str, result_preview: str = ""):
        """报告工具执行完成"""
        preview = (result_preview or "")[:200]
        self._emit("tool_end", f"工具执行完成: {tool_name}", {
            "tool_name": tool_name,
            "preview": preview,
        })

    def report_file_generated(self, file_path: str, filename: str, content: str = ""):
        """报告文件已生成，供前端即时展示"""
        thread_id = get_thread_context()
        if thread_id and filename.endswith(".md"):
            self._run_markdown_files.setdefault(thread_id, []).append(file_path)

        self._emit("file_generated", f"已生成文件: {filename}", {
            "path": file_path,
            "filename": filename,
            "content": content[:12000] if content else "",
        })

    def consume_latest_run_markdown(self, thread_id: str) -> str:
        """读取当前任务运行期间生成的最新 Markdown，避免误读历史会话文件。"""
        paths = self._run_markdown_files.pop(thread_id, [])
        md_paths = [p for p in paths if p.endswith(".md")]
        if not md_paths:
            return ""

        try:
            return Path(md_paths[-1]).read_text(encoding="utf-8").strip()
        except OSError:
            return ""

    def clear_run_markdown_files(self, thread_id: str):
        """清理未消费的任务级 Markdown 记录。"""
        self._run_markdown_files.pop(thread_id, None)

    def report_assistant(self, assistant_name: str, args: Dict[str, Any] = None):
        """报告正在调用的子智能体进度"""
        self._emit("assistant_call", f"正在调用助手: {assistant_name}",
                   {"assistant_name": assistant_name, "args": args})

    def report_task_result(self, result: str):
        """报告任务最终结果"""
        text = result if isinstance(result, str) else str(result)
        self._emit("task_result", "任务执行完成", {"result": text})

    def report_task_cancelled(self, message: str = "任务已停止"):
        """报告任务被用户取消"""
        self._emit("task_cancelled", message, {})

    def report_task_paused(self, message: str = "任务已暂停"):
        """报告任务被用户暂停"""
        self._emit("task_paused", message, {})

    def report_task_resumed(self, message: str = "任务已恢复"):
        """报告任务被用户恢复"""
        self._emit("task_resumed", message, {})

    def report_session_dir(self, path: str):
        """报告任务工作目录"""
        thread_id = get_thread_context()
        if thread_id and self.websocket_manager:
            self.websocket_manager.register_session(thread_id, path)
        self._emit("session_created", f"工作目录已创建: {path}", {"path": path})


# 全局单例实例
monitor = ToolMonitor()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.thread_sessions: Dict[str, str] = {}
        # 延迟绑定 loop，防止初始化时 loop 不一致
        self.loop = None

    def register_session(self, thread_id: str, path: str):
        """记录会话工作目录，供 WebSocket 重连时补发。"""
        self.thread_sessions[thread_id] = path

    def get_loop(self):
        """懒加载获取当前运行的事件循环"""
        if self.loop is None:
            try:
                self.loop = asyncio.get_running_loop()
                # 同时设置 monitor 的 manager (确保双向绑定)
                monitor.set_websocket_manager(self)
                safe_print(f"[Monitor] ConnectionManager auto-bound to loop: {id(self.loop)}")
            except RuntimeError:
                safe_print("[Monitor] Warning: No running event loop found yet.")
        return self.loop

    async def connect(self, websocket: WebSocket, thread_id: str):
        # 每次连接时尝试获取/更新 loop
        self.get_loop()

        await websocket.accept()
        self.active_connections[thread_id] = websocket
        safe_print(f"Client connected: {thread_id}")

        # 补发 session_created，避免前端 WebSocket 晚于任务启动而错过事件
        session_path = self.thread_sessions.get(thread_id)
        if session_path:
            await websocket.send_json({
                "type": "monitor_event",
                "event": "session_created",
                "message": f"工作目录已创建: {session_path}",
                "data": {"path": session_path},
                "timestamp": datetime.datetime.now().isoformat(),
            })

    def disconnect(self, websocket: WebSocket, thread_id: str):
        if thread_id in self.active_connections:
            del self.active_connections[thread_id]
        safe_print(f"Client disconnected: {thread_id}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def send_to_thread(self, message: dict, thread_id: str):
        if thread_id in self.active_connections:
            websocket = self.active_connections[thread_id]
            await websocket.send_json(message)


manager = ConnectionManager()