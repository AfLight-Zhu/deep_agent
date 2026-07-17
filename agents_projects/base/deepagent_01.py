from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent
import os
from dotenv import load_dotenv, find_dotenv

from base.tavily_tool import internet_search

# 使用 find_dotenv() 自动查找 .env 文件，无论你在哪个目录下运行脚本都能正确加载环境变量
load_dotenv(find_dotenv())

# 极简初始化（自动读取OPENAI环境变量）
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    verbose=True,  # 自定义参数
    temperature=0.1,  # 自定义温度（更严谨的回答）
    model_provider="openai"
)

# api地址 https://reference.langchain.com/python/deepagents/graph/
deep_agent = create_deep_agent(
    model=llm,
    tools=[internet_search],
    subagents=[],
    system_prompt="""
      你是一位专家级研究员。你的任务是进行深入研究并撰写一份精美的报告。
      你有权使用 internet_search 工具来收集信息。
    """
)

# 运行代理
prompt = input("输入你关心的问题！")
result = deep_agent.invoke({
    "messages":[
        {"role":"user","content":f"{prompt}"}
    ]
})

"""
结果数据说明
 {
    "messages": [
        # 第0条：你的提问（HumanMessage）
        HumanMessage(content='搜索宇树机器人的新闻！'),
        # 第1条：Agent 调用工具的指令（AIMessage，内容为空，仅触发工具）
        AIMessage(content='', tool_calls=[{'name':'internet_search', ...}]),
        # 第2条：工具返回的搜索结果（ToolMessage，一堆JSON数据）
        ToolMessage(content='{"query":"宇树机器人 新闻","results":[...]}'),
        # 第3条：Agent 整理后的最终回复（AIMessage，这是你要的内容）
        AIMessage(content='以下是关于宇树机器人的一些最新新闻：...')
    ]
}
"""
print(result['messages'][-1].content)