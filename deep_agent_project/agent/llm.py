from dotenv import load_dotenv, find_dotenv
import os
from pathlib import Path
from langchain.chat_models import init_chat_model

# Always load the .env next to the project root, not a parent workspace file.
_project_root = Path(__file__).resolve().parents[1]
load_dotenv(_project_root / ".env", override=True)

model = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    model_provider="openai",
    base_url=os.getenv("OPENAI_BASE_URL"),
    api_key=os.getenv("OPENAI_API_KEY"),
)