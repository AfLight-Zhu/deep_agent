"""Windows 控制台编码兼容工具。"""

from __future__ import annotations

import builtins
import io
import logging
import sys
from typing import Any, TextIO

_BOOTSTRAPPED = False
_ORIGINAL_PRINT = builtins.print


def _set_windows_console_utf8() -> None:
    """将 Windows 控制台代码页设为 UTF-8 (65001)。"""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleOutputCP(65001)
        kernel32.SetConsoleCP(65001)
    except Exception:
        pass


def _get_binary_buffer(stream: TextIO | Any) -> Any:
    """获取可重复包装的二进制缓冲，避免关闭底层流。"""
    if stream is None:
        return None
    if hasattr(stream, "detach"):
        try:
            return stream.detach()
        except Exception:
            pass
    return getattr(stream, "buffer", None)


def _wrap_utf8_stream(stream: TextIO | Any) -> TextIO:
    """将文本流包装为 UTF-8。"""
    buffer = _get_binary_buffer(stream)
    if buffer is None:
        return stream
    return io.TextIOWrapper(
        buffer,
        encoding="utf-8",
        errors="replace",
        line_buffering=True,
    )


def configure_stdio() -> None:
    """将 stdout/stderr 设为 UTF-8，避免 GBK 控制台编码错误。"""
    _set_windows_console_utf8()
    if sys.platform != "win32":
        return

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        try:
            if getattr(stream, "encoding", "").lower() in ("utf-8", "utf8"):
                continue
        except Exception:
            pass
        try:
            setattr(sys, stream_name, _wrap_utf8_stream(stream))
        except Exception:
            pass


def configure_logging() -> None:
    """将所有 logging StreamHandler 重定向到 UTF-8 标准流。"""
    configure_stdio()

    def _fix_logger(logger: logging.Logger) -> None:
        for handler in list(logger.handlers):
            if not isinstance(handler, logging.StreamHandler):
                continue
            try:
                stream = handler.stream
            except Exception:
                stream = None

            target = sys.stderr if stream in (sys.stderr, sys.__stderr__, None) else sys.stdout
            if stream is target:
                continue

            replacement = logging.StreamHandler(target)
            replacement.setLevel(handler.level)
            replacement.setFormatter(handler.formatter)
            replacement.filters = handler.filters[:]
            logger.removeHandler(handler)
            logger.addHandler(replacement)
            try:
                handler.close()
            except Exception:
                pass

    _fix_logger(logging.getLogger())
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        _fix_logger(logging.getLogger(logger_name))


def _patch_builtin_print() -> None:
    """全局替换 builtins.print，防止第三方库直接 print emoji 时崩溃。"""
    if getattr(builtins.print, "_safe_io_patched", False):
        return

    def patched_print(*args: Any, **kwargs: Any) -> None:
        safe_print(*args, **kwargs)

    patched_print._safe_io_patched = True  # type: ignore[attr-defined]
    builtins.print = patched_print  # type: ignore[assignment]


def _patch_langchain_print_text() -> None:
    """让 LangChain 的 print_text 走安全输出。"""
    try:
        import langchain_core.utils.input as lc_input
    except ImportError:
        return

    if getattr(lc_input.print_text, "_safe_io_patched", False):
        return

    def patched_print_text(
        text: str,
        color: str | None = None,
        end: str = "",
        file: TextIO | None = None,
    ) -> None:
        if file is not None and file not in (sys.stdout, sys.stderr):
            _ORIGINAL_PRINT(text, end=end, file=file)
            return
        safe_print(text, end=end)

    patched_print_text._safe_io_patched = True  # type: ignore[attr-defined]
    lc_input.print_text = patched_print_text


def bootstrap_encoding(*, force: bool = False) -> None:
    """进程启动时统一配置 UTF-8 输出（应在其他业务模块导入前调用）。"""
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED and not force:
        return
    _BOOTSTRAPPED = True

    configure_stdio()
    configure_logging()
    _patch_builtin_print()
    _patch_langchain_print_text()


def safe_print(*args: Any, **kwargs: Any) -> None:
    """在 GBK 等受限控制台下安全输出。"""
    configure_stdio()
    file = kwargs.get("file")
    if file is not None and file not in (sys.stdout, sys.stderr):
        _ORIGINAL_PRINT(*args, **kwargs)
        return

    try:
        _ORIGINAL_PRINT(*args, **kwargs)
    except UnicodeEncodeError:
        end = kwargs.get("end", "\n")
        sep = kwargs.get("sep", " ")
        text = sep.join(str(arg) for arg in args)
        stream = file or sys.stdout
        payload = text.encode("utf-8", errors="replace") + str(end).encode("utf-8", errors="replace")
        if hasattr(stream, "buffer"):
            stream.buffer.write(payload)
            stream.flush()
        else:
            stream.write(text + str(end))
            stream.flush()
