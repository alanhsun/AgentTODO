import os
import json
from typing import List, Optional, Dict, Any

import requests

# Task Tracker API Base URL（可通过环境变量 AGENTTODO_URL 覆盖，例如 http://192.168.1.10:3300/api）
BASE_URL = os.environ.get("AGENTTODO_URL", "http://localhost:3300/api").rstrip("/")
# 请求超时（秒），避免服务无响应时 AI 工具调用一直挂起
TIMEOUT = float(os.environ.get("AGENTTODO_TIMEOUT", "10"))

VALID_STATUSES = ['todo', 'in_progress', 'done']


def _dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


def _error(e: Exception) -> str:
    """统一错误输出：如果是后端返回的错误，带上具体原因，方便 AI 自我修正。"""
    if isinstance(e, requests.HTTPError) and e.response is not None:
        try:
            body = e.response.json()
            message = body.get("error") or "; ".join(body.get("errors", [])) or str(e)
        except ValueError:
            message = str(e)
        return _dumps({"error": message, "http_status": e.response.status_code})
    return _dumps({"error": str(e)})


def _request(method: str, path: str, **kwargs) -> Any:
    response = requests.request(method, f"{BASE_URL}{path}", timeout=TIMEOUT, **kwargs)
    response.raise_for_status()
    return response.json()


def get_daily_summary() -> str:
    """获取当前任务的完整统计概览（包含总数、今日待办数、逾期数、今日已完成数）。AI 每日初次对话前应调用此工具。"""
    try:
        return _dumps(_request("GET", "/tasks/summary"))
    except Exception as e:
        return _error(e)


def get_today_agenda() -> str:
    """获取今日到期以及已逾期的所有任务详情。包含子任务列表（含子任务 ID）与完成进度。"""
    try:
        return _dumps(_request("GET", "/tasks/today"))
    except Exception as e:
        return _error(e)


def get_user_tags() -> str:
    """获取用户当前正在使用的所有标签。在分析用户生活节奏、或者创建新任务之前，应调用此工具规范化任务分类。"""
    try:
        return _dumps(_request("GET", "/tags"))
    except Exception as e:
        return _error(e)


def search_tasks(search: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None,
                 tag: Optional[str] = None, due_before: Optional[str] = None, due_after: Optional[str] = None,
                 limit: int = 20) -> str:
    """按关键词 / 状态 / 优先级 / 标签 / 日期范围搜索任务。当用户提到某个任务但你不知道它的 ID 时，先调用此工具。
    - status / priority / tag 支持逗号分隔的多个值，例如 'todo,in_progress'。
    """
    params: Dict[str, Any] = {"limit": limit}
    for key, value in {"search": search, "status": status, "priority": priority, "tag": tag,
                       "due_before": due_before, "due_after": due_after}.items():
        if value:
            params[key] = value
    try:
        result = _request("GET", "/tasks", params=params)
        tasks = [{
            "id": t["id"],
            "title": t["title"],
            "status": t["status"],
            "priority": t["priority"],
            "due_date": t.get("due_date"),
            "recurrence": t.get("recurrence"),
            "tags": [tag_item["name"] for tag_item in t.get("tags", [])],
            "subtask_progress": t.get("subtask_progress"),
        } for t in result["data"]]
        return _dumps({"total": result["pagination"]["total"], "tasks": tasks})
    except Exception as e:
        return _error(e)


def get_task(task_id: int) -> str:
    """获取单个任务的完整详情：标签、子任务列表（含 ID 与完成状态）、历史进展笔记。"""
    try:
        return _dumps(_request("GET", f"/tasks/{task_id}"))
    except Exception as e:
        return _error(e)


def create_task(title: str, priority: str = 'medium', due_date: Optional[str] = None,
                recurrence: str = 'none', subtasks: Optional[List[str]] = None, tags: Optional[List[int]] = None,
                description: Optional[str] = None) -> str:
    """创建一个新任务或周期性习惯。
    - priority: 必须是 'low', 'medium', 'high', 'urgent' 之一。
    - recurrence: 必须是 'none', 'daily', 'weekly', 'monthly' 之一。周期任务完成后系统会自动生成下一次任务。
    - subtasks: 字符串列表，如果这是一个大任务，建议将其按步骤拆分为子任务（例如 ["第一步", "第二步"]）。
    - tags: 已有标签的 ID 列表。
    """
    payload: Dict[str, Any] = {
        "title": title,
        "priority": priority,
        "recurrence": recurrence
    }
    if description:
        payload["description"] = description
    if due_date:
        payload["due_date"] = due_date
    if subtasks:
        payload["subtasks"] = subtasks
    if tags:
        payload["tags"] = tags

    try:
        return f"Task created successfully. Details: {_dumps(_request('POST', '/tasks', json=payload))}"
    except Exception as e:
        return _error(e)


def update_task(task_id: int, title: Optional[str] = None, priority: Optional[str] = None,
                due_date: Optional[str] = None, recurrence: Optional[str] = None,
                tags: Optional[List[int]] = None, description: Optional[str] = None) -> str:
    """更新已有任务的基本信息（标题、描述、优先级、截止日期、标签等）。如果要更新状态或子任务，推荐使用 add_task_progress_note。"""
    payload: Dict[str, Any] = {}
    if title is not None:
        payload["title"] = title
    if description is not None:
        payload["description"] = description
    if priority is not None:
        payload["priority"] = priority
    if due_date is not None:
        payload["due_date"] = due_date
    if recurrence is not None:
        payload["recurrence"] = recurrence
    if tags is not None:
        payload["tags"] = tags

    if not payload:
        return _dumps({"error": "No fields to update provided."})

    try:
        return f"Task updated successfully. Details: {_dumps(_request('PUT', f'/tasks/{task_id}', json=payload))}"
    except Exception as e:
        return _error(e)


def add_task_progress_note(task_id: int, note_content: str, complete_subtasks: Optional[List[int]] = None, task_status: Optional[str] = None) -> str:
    """当用户口头报告了任务的进展、障碍时，调用此工具将记录附加到任务上，并可选地勾选子任务或更新主任务状态。
    - task_id: 任务的数字ID。
    - note_content: 作为AI助手，为该任务填写的追踪日志内容。
    - complete_subtasks: 刚刚完成的子任务的ID列表（将它们标记为已完成，可通过 get_task / get_today_agenda 获取）。
    - task_status: 如果任务彻底完成，可传入 'done'；如果刚开始，传入 'in_progress'。
    """
    if task_status is not None and task_status not in VALID_STATUSES:
        return _dumps({"error": f"task_status must be one of {VALID_STATUSES}"})

    results = []
    try:
        # 1. 添加追踪笔记
        _request("POST", f"/tasks/{task_id}/notes", json={"content": note_content, "source": "ai"})
        results.append("Note added.")

        # 2. 勾选子任务（单个失败不影响其它子任务，并如实汇报）
        if complete_subtasks:
            done, failed = [], []
            for sid in complete_subtasks:
                try:
                    _request("PUT", f"/tasks/{task_id}/subtasks/{sid}", json={"completed": True})
                    done.append(sid)
                except Exception as sub_err:
                    failed.append({"id": sid, "error": json.loads(_error(sub_err))["error"]})
            results.append(f"Subtasks {done} marked as completed.")
            if failed:
                results.append(f"Failed to complete subtasks: {_dumps(failed)}")

        # 3. 更新主任务状态
        if task_status:
            updated = _request("PUT", f"/tasks/{task_id}", json={"status": task_status})
            results.append(f"Task status updated to {task_status}.")
            if updated.get("next_occurrence"):
                results.append(f"Recurring task: next occurrence created {_dumps(updated['next_occurrence'])}.")

        return "\n".join(results)
    except Exception as e:
        if results:
            return "\n".join(results) + "\n" + _error(e)
        return _error(e)


# ==========================================
# OpenClaw / OpenAI 工具规范定义 (Tool Schema)
# 可以直接导出并配置到 OpenClaw 的插件配置中
# ==========================================
OPENCLAW_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "get_daily_summary",
            "description": "获取当前任务的完整统计概览（总数、今日待办数、逾期数、今日已完成数）。"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_today_agenda",
            "description": "获取今日到期以及已逾期的所有任务详情（含子任务列表与子任务 ID）。"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_tags",
            "description": "获取用户当前正在使用的所有标签，返回标签名称和其ID。创建任务前应参考已有标签系统。"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_tasks",
            "description": "按关键词、状态、优先级、标签或日期范围搜索任务。用户提到某个任务但不知道其 ID 时先调用此工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "匹配标题和描述的关键词"},
                    "status": {"type": "string", "description": "todo / in_progress / done，多个用逗号分隔"},
                    "priority": {"type": "string", "description": "low / medium / high / urgent，多个用逗号分隔"},
                    "tag": {"type": "string", "description": "标签 ID，多个用逗号分隔"},
                    "due_before": {"type": "string", "description": "截止日期不晚于，格式 YYYY-MM-DD"},
                    "due_after": {"type": "string", "description": "截止日期不早于，格式 YYYY-MM-DD"},
                    "limit": {"type": "integer", "description": "返回条数，默认 20"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_task",
            "description": "获取单个任务的完整详情（标签、子任务列表及 ID、历史进展笔记）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "任务ID"}
                },
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "创建一个新任务或周期性习惯。周期任务完成后系统会自动生成下一次任务。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务的标题。"},
                    "description": {"type": "string", "description": "任务描述（可选）"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "due_date": {"type": "string", "description": "截止日期，格式 YYYY-MM-DD"},
                    "recurrence": {"type": "string", "enum": ["none", "daily", "weekly", "monthly"]},
                    "subtasks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "细分的执行步骤列表"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "已存在的标签ID数组"
                    }
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "更新已存在任务的基本信息（如标题、描述、优先级、重复频率、截止日期等）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "需要更新的任务ID"},
                    "title": {"type": "string", "description": "新的标题名称"},
                    "description": {"type": "string", "description": "新的任务描述"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "due_date": {"type": "string", "description": "新的截止日期，格式 YYYY-MM-DD"},
                    "recurrence": {"type": "string", "enum": ["none", "daily", "weekly", "monthly"]},
                    "tags": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "需要重新绑定的新标签ID数组。如果你不想修改已有标签，请不要提供此参数。"
                    }
                },
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_task_progress_note",
            "description": "记录任务执行进展、口头反馈的障碍，或标记子任务、主任务状态。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "任务ID"},
                    "note_content": {"type": "string", "description": "AI生成的进展日志，记录用户的口头反馈或执行情况"},
                    "complete_subtasks": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "刚刚完成的子任务ID（sid）列表，可通过 get_task / get_today_agenda 获取"
                    },
                    "task_status": {"type": "string", "enum": ["todo", "in_progress", "done"]}
                },
                "required": ["task_id", "note_content"]
            }
        }
    }
]
