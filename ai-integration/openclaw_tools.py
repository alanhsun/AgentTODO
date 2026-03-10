import requests
import json
from typing import List, Optional, Dict, Any

# Task Tracker API Base URL
BASE_URL = "http://localhost:3300/api"

def get_daily_summary() -> str:
    """获取当前任务的完整统计概览（包含总数、今日待办数、逾期数统计）。AI 每日初次对话前应调用此工具。"""
    try:
        response = requests.get(f"{BASE_URL}/tasks/summary")
        response.raise_for_status()
        return json.dumps(response.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})

def get_today_agenda() -> str:
    """获取今日到期以及已逾期的所有任务详情。包含被分解的子任务完成进度。"""
    try:
        response = requests.get(f"{BASE_URL}/tasks/today")
        response.raise_for_status()
        return json.dumps(response.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})

def get_user_tags() -> str:
    """获取用户当前正在使用的所有标签。在分析用户生活节奏、或者创建新任务之前，应调用此工具规范化任务分类。"""
    try:
        response = requests.get(f"{BASE_URL}/tags")
        response.raise_for_status()
        return json.dumps(response.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})

def create_task(title: str, priority: str = 'medium', due_date: Optional[str] = None, 
                recurrence: str = 'none', subtasks: Optional[List[str]] = None, tags: Optional[List[int]] = None) -> str:
    """创建一个新任务或周期性习惯。
    - priority: 必须是 'low', 'medium', 'high', 'urgent' 之一。
    - recurrence: 必须是 'none', 'daily', 'weekly', 'monthly' 之一。
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

    try:
        response = requests.post(f"{BASE_URL}/tasks", json=payload)
        response.raise_for_status()
        return f"Task created successfully. Details: {json.dumps(response.json(), ensure_ascii=False)}"
    except Exception as e:
        return json.dumps({"error": str(e)})

def update_task(task_id: int, title: Optional[str] = None, priority: Optional[str] = None, 
                due_date: Optional[str] = None, recurrence: Optional[str] = None) -> str:
    """更新已有任务的基本信息（标题、优先级、截止日期等）。如果要更新状态或子任务，推荐使用 add_task_progress_note。"""
    payload: Dict[str, Any] = {}
    if title is not None:
        payload["title"] = title
    if priority is not None:
        payload["priority"] = priority
    if due_date is not None:
        payload["due_date"] = due_date
    if recurrence is not None:
        payload["recurrence"] = recurrence

    if not payload:
        return json.dumps({"error": "No fields to update provided."})

    try:
        response = requests.put(f"{BASE_URL}/tasks/{task_id}", json=payload)
        response.raise_for_status()
        return f"Task updated successfully. Details: {json.dumps(response.json(), ensure_ascii=False)}"
    except Exception as e:
        return json.dumps({"error": str(e)})

def add_task_progress_note(task_id: int, note_content: str, complete_subtasks: Optional[List[int]] = None, task_status: Optional[str] = None) -> str:
    """当用户口头报告了任务的进展、障碍时，调用此工具将记录附加到任务上，并可选地勾选子任务或更新主任务状态。
    - task_id: 任务的数字ID。
    - note_content: 作为AI助手，为该任务填写的追踪日志内容。
    - complete_subtasks: 刚刚完成的子任务的ID列表（将它们标记为已完成）。
    - task_status: 如果任务彻底完成，可传入 'done'；如果刚开始，传入 'in_progress'。
    """
    results = []
    try:
        # 1. 添加追踪笔记
        note_res = requests.post(f"{BASE_URL}/tasks/{task_id}/notes", json={"content": note_content, "source": "ai"})
        note_res.raise_for_status()
        results.append("Note added.")

        # 2. 勾选子任务
        if complete_subtasks:
            for sid in complete_subtasks:
                requests.put(f"{BASE_URL}/tasks/{task_id}/subtasks/{sid}", json={"completed": True})
            results.append(f"Subtasks {complete_subtasks} marked as completed.")

        # 3. 更新主任务状态
        if task_status in ['todo', 'in_progress', 'done']:
            requests.put(f"{BASE_URL}/tasks/{task_id}", json={"status": task_status})
            results.append(f"Task status updated to {task_status}.")

        return "\n".join(results)
    except Exception as e:
        return json.dumps({"error": str(e)})

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
            "name": "create_task",
            "description": "创建一个新任务或周期性习惯。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务的标题。"},
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
            "description": "更新已存在任务的基本信息（如标题、优先级、重复频率、截止日期等）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "需要更新的任务ID"},
                    "title": {"type": "string", "description": "新的标题名称"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "due_date": {"type": "string", "description": "新的截止日期，格式 YYYY-MM-DD"},
                    "recurrence": {"type": "string", "enum": ["none", "daily", "weekly", "monthly"]}
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
                    "task_status": {"type": "string", "enum": ["todo", "in_progress", "done"]}
                },
                "required": ["task_id", "note_content"]
            }
        }
    }
]
