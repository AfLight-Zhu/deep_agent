"""Python 启动时自动加载，确保任意入口都启用 UTF-8。"""
try:
    from utils.safe_io import bootstrap_encoding

    bootstrap_encoding()
except Exception:
    pass
