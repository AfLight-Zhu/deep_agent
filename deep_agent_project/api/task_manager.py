import asyncio
from typing import Dict, Set

_running_tasks: Dict[str, asyncio.Task] = {}
_cancelled_threads: Set[str] = set()
_paused_threads: Set[str] = set()


def register_task(thread_id: str, task: asyncio.Task) -> None:
    _running_tasks[thread_id] = task
    _cancelled_threads.discard(thread_id)
    _paused_threads.discard(thread_id)


def unregister_task(thread_id: str) -> None:
    _running_tasks.pop(thread_id, None)
    _cancelled_threads.discard(thread_id)
    _paused_threads.discard(thread_id)


def is_cancelled(thread_id: str) -> bool:
    return thread_id in _cancelled_threads


def is_paused(thread_id: str) -> bool:
    return thread_id in _paused_threads


def request_pause(thread_id: str) -> bool:
    task = _running_tasks.get(thread_id)
    if task is None or task.done():
        return False
    _paused_threads.add(thread_id)
    return True


def request_resume(thread_id: str) -> bool:
    if thread_id not in _paused_threads:
        return False
    _paused_threads.discard(thread_id)
    return True


def request_cancel(thread_id: str) -> bool:
    task = _running_tasks.get(thread_id)
    if task is None and thread_id not in _cancelled_threads:
        return False

    _cancelled_threads.add(thread_id)
    _paused_threads.discard(thread_id)
    if task and not task.done():
        task.cancel()
    return True


def request_cancel_all() -> list[str]:
    stopped = []
    for thread_id in list_running_tasks():
        if request_cancel(thread_id):
            stopped.append(thread_id)
    return stopped


def list_running_tasks() -> list[str]:
    return [tid for tid, task in _running_tasks.items() if not task.done()]
