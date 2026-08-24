import json
import os
import requests
from typing import List, Optional, Dict, Any

# Task Tracker API Base URL
BASE_URL = os.getenv("AGENTTODO_URL", "http://localhost:3300/api").rstrip("/")
_timeout_ms = os.getenv("AGENTTODO_TIMEOUT_MS")
REQUEST_TIMEOUT = float(_timeout_ms) / 1000 if _timeout_ms else float(os.getenv("AGENTTODO_TIMEOUT", "10"))
SESSION = requests.Session()
if os.getenv("AGENTTODO_API_TOKEN"):
    SESSION.headers.update({"Authorization": f"Bearer {os.environ['AGENTTODO_API_TOKEN']}"})

def _request(method: str, path: str, **kwargs: Any) -> str:
    """Call AgentTODO and always return machine-readable JSON."""
    try:
        response = SESSION.request(method, f"{BASE_URL}{path}", timeout=REQUEST_TIMEOUT, **kwargs)
        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text or "Empty response"}
        if not response.ok:
            return json.dumps({
                "error": {
                    "status": response.status_code,
                    "message": payload.get("error", "Request failed") if isinstance(payload, dict) else "Request failed",
                    "details": payload.get("errors") if isinstance(payload, dict) else None,
                    "retryable": response.status_code >= 500,
                }
            }, ensure_ascii=False)
        return json.dumps(payload, ensure_ascii=False)
    except requests.Timeout:
        return json.dumps({"error": {"message": "AgentTODO request timed out", "retryable": True}}, ensure_ascii=False)
    except requests.RequestException as error:
        return json.dumps({"error": {"message": str(error), "retryable": True}}, ensure_ascii=False)

def get_daily_summary() -> str:
    """获取当前任务的完整统计概览（包含总数、今日待办数、逾期数统计）。AI 每日初次对话前应调用此工具。"""
    return _request("GET", "/tasks/summary")

def get_today_agenda() -> str:
    """获取今日到期以及已逾期的所有任务详情。包含被分解的子任务完成进度。"""
    return _request("GET", "/tasks/today")

def get_user_tags() -> str:
    """获取用户当前正在使用的所有标签。在分析用户生活节奏、或者创建新任务之前，应调用此工具规范化任务分类。"""
    return _request("GET", "/tags")

def search_tasks(search: str, status: Optional[str] = None, limit: int = 20) -> str:
    """按标题或描述搜索任务；写入前先用它确认任务 ID。"""
    params: Dict[str, Any] = {"search": search, "limit": max(1, min(limit, 50))}
    if status:
        params["status"] = status
    return _request("GET", "/tasks", params=params)

def get_task_context(task_id: int) -> str:
    """一次获取任务、标签、子任务、笔记、附件元数据和近期重复完成记录。"""
    return _request("GET", f"/tasks/{task_id}/context")

def create_task(title: str, priority: str = 'medium', due_date: Optional[str] = None, 
                recurrence: str = 'none', subtasks: Optional[List[str]] = None, tags: Optional[List[int]] = None) -> str:
    """创建一个新任务或周期性习惯。
    - priority: 必须是 'low', 'medium', 'high', 'urgent' 之一。
    - recurrence: 必须是 'none', 'daily', 'weekdays', 'weekly', 'monthly' 之一。
    - subtasks: 字符串列表，如果这是一个大任务，建议将其按步骤拆分为子任务（例如 ["第一步", "第二步"]）。
    - tags: 已有标签的 ID 列表。
    """
    payload: Dict[str, Any] = {
        "title": title,
        "priority": priority,
        "recurrence": recurrence
    }
    if due_date:
        payload["due_date"] = due_date
    if subtasks:
        payload["subtasks"] = subtasks
    if tags:
        payload["tags"] = tags

    return _request("POST", "/tasks", json=payload)

def update_task(task_id: int, title: Optional[str] = None, priority: Optional[str] = None, 
                due_date: Optional[str] = None, recurrence: Optional[str] = None,
                tags: Optional[List[int]] = None) -> str:
    """更新已有任务的基本信息（标题、优先级、截止日期、标签等）。如果要更新状态或子任务，推荐使用 add_task_progress_note。"""
    payload: Dict[str, Any] = {}
    if title is not None:
        payload["title"] = title
    if priority is not None:
        payload["priority"] = priority
    if due_date is not None:
        payload["due_date"] = due_date
    if recurrence is not None:
        payload["recurrence"] = recurrence
    if tags is not None:
        payload["tags"] = tags

    if not payload:
        return json.dumps({"error": "No fields to update provided."})

    return _request("PUT", f"/tasks/{task_id}", json=payload)

def add_task_progress_note(task_id: int, note_content: str, complete_subtasks: Optional[List[int]] = None,
                           task_status: Optional[str] = None, occurrence_date: Optional[str] = None,
                           occurrence_completed: Optional[bool] = None, request_id: Optional[str] = None) -> str:
    """当用户口头报告了任务的进展、障碍时，调用此工具将记录附加到任务上，并可选地勾选子任务或更新主任务状态。
    - task_id: 任务的数字ID。
    - note_content: 作为AI助手，为该任务填写的追踪日志内容。
    - complete_subtasks: 刚刚完成的子任务的ID列表（将它们标记为已完成）。
    - task_status: 如果任务彻底完成，可传入 'done'；如果刚开始，传入 'in_progress'。
    """
    payload: Dict[str, Any] = {"note_content": note_content, "source": "ai"}
    if complete_subtasks is not None:
        payload["complete_subtasks"] = complete_subtasks
    if task_status is not None:
        payload["task_status"] = task_status
    if occurrence_date is not None or occurrence_completed is not None:
        payload["occurrence_date"] = occurrence_date
        payload["occurrence_completed"] = occurrence_completed
    if request_id is not None:
        payload["request_id"] = request_id
    return _request("POST", f"/tasks/{task_id}/progress", json=payload)

# ==========================================
# OpenClaw / OpenAI 工具规范定义 (Tool Schema)
# 可以直接导出并配置到 OpenClaw 的插件配置中
# ==========================================
OPENCLAW_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "get_daily_summary",
            "description": "获取当前任务的完整统计概览（总数、今日待办数、逾期数统计）。"
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_today_agenda",
            "description": "获取今日到期以及已逾期的所有任务详情（含子任务）。"
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
            "description": "按标题或描述搜索任务，写入前用于确认任务 ID。",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string"},
                    "status": {"type": "string", "enum": ["todo", "in_progress", "done"]},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50}
                },
                "required": ["search"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_task_context",
            "description": "获取单个任务的完整紧凑上下文，包括子任务、笔记、附件元数据和近期重复完成记录。",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {"type": "integer", "minimum": 1}},
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "创建一个新任务或周期性习惯。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务的标题。"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "due_date": {"type": "string", "description": "截止日期，格式 YYYY-MM-DD"},
                    "recurrence": {"type": "string", "enum": ["none", "daily", "weekdays", "weekly", "monthly"]},
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
            "description": "更新已存在任务的基本信息（如标题、优先级、重复频率、截止日期等）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "需要更新的任务ID"},
                    "title": {"type": "string", "description": "新的标题名称"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "due_date": {"type": "string", "description": "新的截止日期，格式 YYYY-MM-DD"},
                    "recurrence": {"type": "string", "enum": ["none", "daily", "weekdays", "weekly", "monthly"]},
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
                        "description": "刚刚完成的子任务ID（sid）列表"
                    },
                    "task_status": {"type": "string", "enum": ["todo", "in_progress", "done"]},
                    "occurrence_date": {"type": "string", "description": "重复任务本次发生日期，格式 YYYY-MM-DD"},
                    "occurrence_completed": {"type": "boolean", "description": "是否完成该日期对应的一次重复任务"},
                    "request_id": {"type": "string", "description": "本次调用的唯一 ID，重试时保持不变以避免重复记录"}
                },
                "required": ["task_id", "note_content"]
            }
        }
    }
]
