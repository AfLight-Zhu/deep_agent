"""GBK 编码回归测试：验证 emoji/特殊字符不会导致崩溃。"""
import sys
import io
from pathlib import Path

project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="gbk", errors="strict")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="gbk", errors="strict")

from utils.safe_io import bootstrap_encoding, safe_print

bootstrap_encoding()

content = "\u26a0\ufe0f 药品销售排名\n\n测试内容"

safe_print("Test safe_print:", content[:10])

from langchain_core.utils.input import print_text

print_text(content)

import builtins

builtins.print("builtin print:", content[:10])

from tools.markdown_tools import generate_markdown

result = generate_markdown.invoke(
    {"content": content, "filename": "emoji_final_test.md", "path": ""}
)
safe_print("Tool result:", result[:80])

file_path = Path(result.split("'")[1])
safe_print("File exists:", file_path.exists())
safe_print("File head:", file_path.read_text(encoding="utf-8")[:20])
safe_print("ALL TESTS PASSED")
