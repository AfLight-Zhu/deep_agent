from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent
import os
import asyncio  # 新增：导入异步库
from dotenv import load_dotenv, find_dotenv
import json

load_dotenv(find_dotenv())

# 极简初始化（自动读取OPENAI环境变量）
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    verbose=True,  # 自定义参数
    temperature=0.1,  # 自定义温度（更严谨的回答）
    model_provider="openai"
)

# 1. 定义子智能体：天气助手（和原来一致）
weather_agent = {
    "name": "weather_helper",
    "description": "用于查询天气信息。当用户询问天气时，请调用此助手。",
    "system_prompt": "你是一个天气助手。无论用户问哪个城市的天气，你都统一回答：'今日天气晴朗，气温 25 度，适合出游。'",
    "model": llm,
    "tools": []
}

# 2. 定义子智能体：计算助手（和原来一致）
math_agent = {
    "name": "math_helper",
    "description": "用于处理数学计算问题。",
    "system_prompt": "你是一个严谨的数学助手。请帮助用户计算数学问题。",
    "model": llm,
    "tools": []
}

# 3. 定义子智能体：翻译助手（和原来一致）
translate_agent = {
    "name": "translator",
    "description": "用于中英互译任务。",
    "system_prompt": "你是一个翻译助手。如果是中文请翻译成英文，如果是英文请翻译成中文。",
    "model": llm,
    "tools": []
}

# 4. 创建主智能体（和原来一致）
main_agent = create_deep_agent(
    model=llm,
    tools=[],
    subagents=[weather_agent, math_agent, translate_agent],
    system_prompt="你是一个全能管家。你会根据用户的需求，调度不同的助手来解决问题。"
)


# 5. 异步版本：适配 astream()（核心修改）
async def test_astream(query):  # 新增 async 定义协程函数
    print(f"\n>>> 提问: {query}")
    # 核心修改：同步 for → 异步 async for
    async for chunk in main_agent.astream({"messages": [{"role": "user", "content": query}]}):
        for node_name, state in chunk.items():
            if not state or "messages" not in state: continue
            messages = state["messages"]
            if messages and isinstance(messages, list):
                last_msg = messages[-1]
                # 1. 模型节点逻辑（和原来一致）
                if node_name == "model":
                    if last_msg.tool_calls:
                        for tool_call in last_msg.tool_calls:
                            if tool_call['name'] == 'task':
                                sub_agent = tool_call['args'].get('subagent_type')
                                print(f"[模型决策] 呼叫子智能体: {sub_agent}")
                            else:
                                print(f"[模型决策] 调用工具: {tool_call['name']},参数为：{tool_call['args']}")
                    elif last_msg.content:
                        print(f"[最终回复] {last_msg.content}")
                # 2. 工具节点逻辑（和原来一致）
                elif node_name == "tools":
                    content_preview = ''
                    if len(last_msg.content) > 100:
                        content_preview = last_msg.content[:100] + "..."
                    else:
                        content_preview = last_msg.content
                    print(f"[执行结果] {content_preview}")

# 6. 执行异步函数（新增）
if __name__ == "__main__":
    # 执行单个查询
    #asyncio.run(test_astream("北京今天天气怎么样？"))
    # 也可以并发执行多个查询（协程核心优势）
    async def batch_run():
        # 并发执行2个查询
        task1 = test_astream("北京今天天气怎么样？")
        task2 = test_astream("100 + 256 等于多少？")
        task3 = test_astream("将 你好 翻译成 英文？")
        await asyncio.gather(task1, task2,task3)

    # # 执行包装后的协程
    asyncio.run(batch_run())