# -*- coding: utf-8 -*-
"""
DeepAgents 中断审批-EDIT操作示例
核心功能：演示人工编辑工具参数后恢复执行的完整流程
"""
import os
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())


# ======================== 1. 定义工具函数 ========================
@tool
def delete_database(table_name: str):
    """危险操作：删除数据库表"""
    print(f"[工具执行] 删除表: {table_name}")
    return f"已成功删除表: {table_name}"


@tool
def select_data(table_name: str):
    """查询指定表名的数据"""
    print(f"[工具执行] 查询指定表名数据: {table_name}")
    return f"查询数据成功：{table_name}"


@tool
def delete_file(file_name: str):
    """危险操作：删除文件"""
    print(f"[工具执行] 删除文件: {file_name}")
    return f"已成功删除文件: {file_name}"


# ======================== 2. 核心配置 ========================
checkpointer = InMemorySaver()

# 初始化LLM
llm = init_chat_model(
    model=os.getenv("LLM_QWEN_MAX"),
    model_provider="openai"
)

# 创建Agent
deep_agent = create_deep_agent(
    model=llm,
    tools=[delete_database, delete_file, select_data],
    interrupt_on={"delete_database": True, "delete_file": True},  # 高危操作触发审批
    checkpointer=checkpointer,
    system_prompt="所有的回答都使用中文！严格按照审批后的参数执行工具操作！"
)

# ======================== 3. EDIT审批核心逻辑 ========================
# 会话配置
thread_config = {"configurable": {"thread_id": "edit_safe_thread_1"}}

print("\n=== 第一阶段：触发中断（获取原始操作参数）===")
# 第一次调用：触发中断，获取Agent规划的原始操作参数
result = deep_agent.invoke(
    {
        "messages": [
            {
                "role": "user",
                "content": "删除users表！删除/user.txt文件！"
            }
        ]
    },
    config=thread_config
)

# 检测中断并处理EDIT审批
if result.get("__interrupt__"):
    # 1. 解析中断数据（提取原始操作参数）
    interrupts = result["__interrupt__"][0].value
    action_requests = interrupts["action_requests"]

    print(f"\n=== 待审批操作列表 ===")
    for idx, action in enumerate(action_requests):
        print(f"操作{idx + 1} - 工具名: {action['name']}, 原始参数: {action['args']}")

    # 2. 模拟人工编辑参数（核心：EDIT操作）
    # 场景：
    # - delete_database：原始参数users → 编辑为test_users（避免删正式表）
    # - delete_file：原始参数/user.txt → 编辑为/tmp/test.txt（避免删核心文件）
    decisions = []
    for action in action_requests:
        if action["name"] == "delete_database":
            # 编辑删库参数：仅删除测试表
            decisions.append({
                "type": "edit",  # 审批类型：编辑参数
                "edited_action": {
                    "name": action["name"],  # 必须保留工具名
                    "args": {"table_name": "test_users"}  # 编辑后的参数
                }
            })
        elif action["name"] == "delete_file":
            # 编辑删文件参数：仅删除临时文件
            decisions.append({
                "type": "edit",
                "edited_action": {
                    "name": action["name"],
                    "args": {"file_name": "/tmp/test.txt"}
                }
            })

    print(f"\n=== 人工编辑后的审批决策 ===")
    print(f"审批结果: {decisions}")

    # 3. 恢复执行（使用编辑后的参数）
    print("\n=== 第二阶段：恢复执行（使用编辑后的参数）===")
    result = deep_agent.invoke(
        Command(resume={"decisions": decisions}),  # 传入编辑后的决策
        config=thread_config  # 必须使用相同的thread_id
    )

    # 4. 输出最终结果
    print("\n=== 执行完成 ===")
    print(f"Agent最终回复: {result['messages'][-1].content}")
else:
    # 无中断时直接输出结果
    print("无需要审批的操作，执行结果:", result["messages"][-1].content)