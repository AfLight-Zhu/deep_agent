from typing import Literal
from langchain.tools import tool
from tavily import TavilyClient
from dotenv import load_dotenv,find_dotenv
import os

# 加载 .env文件
load_dotenv(find_dotenv())

# 创建tavily_client
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

# 定义搜索工具
@tool
def internet_search(
        query:str,
        max_results:int =10,
        topic:Literal["general","news"] = "general",
        include_raw_content:bool = False):
    """
    互联网搜索工具！
    :param query: 搜索关键字
    :param max_results: 返回结果数量
    :param topic: 主题类型
    :param include_raw_content: False精简 True 返回详细结果
    :return: 搜索结果列表
    """
    print(f"进行网络搜索！搜索条件：{query},搜索主题类别:{topic},搜索最大的条数：{max_results}")
    return tavily_client.search(
        query=query,
        max_results=max_results,
        topic=topic,
        include_raw_content=include_raw_content
    )