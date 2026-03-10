#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3300/api';

const server = new Server(
  {
    name: "agenttodo-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {}
    }
  }
);

// --- TOOLS 注册 ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_daily_summary",
        description: "获取当前任务的完整统计概览（总数、今日待办数、逾期数统计）。",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "get_today_agenda",
        description: "获取今日到期以及已逾期的所有任务详情（含子任务进度）。",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "get_user_tags",
        description: "获取全部可用标签。在创建任务前应参考已有标签。",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "create_task",
        description: "创建一个新任务或周期性习惯。",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "任务标题" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            due_date: { type: "string", description: "截止日期 YYYY-MM-DD" },
            recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
            subtasks: { type: "array", items: { type: "string" }, description: "执行步骤列表" },
            tags: { type: "array", items: { type: "integer" }, description: "标签ID数组" }
          },
          required: ["title"]
        }
      },
      {
        name: "update_task",
        description: "更新已有任务的属性（如标题、优先级、重复频率、截止日期）。",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "integer", description: "任务ID" },
            title: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            due_date: { type: "string", description: "YYYY-MM-DD" },
            recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly"] }
          },
          required: ["task_id"]
        }
      },
      {
        name: "add_task_progress_note",
        description: "记录任务进展、障碍，或标记子任务或主任务完成状态。",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "integer", description: "任务ID" },
            note_content: { type: "string", description: "进展描述，日志内容" },
            complete_subtasks: { type: "array", items: { type: "integer" }, description: "勾选完成的子任务ID数组" },
            task_status: { type: "string", enum: ["todo", "in_progress", "done"], description: "更新主任务状态" }
          },
          required: ["task_id", "note_content"]
        }
      }
    ]
  };
});

// --- TOOLS 实施 ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    if (name === "get_daily_summary") {
      const res = await axios.get(`${BASE_URL}/tasks/summary`);
      return formatResult(res.data);
    } 
    
    if (name === "get_today_agenda") {
      const res = await axios.get(`${BASE_URL}/tasks/today`);
      return formatResult(res.data);
    } 
    
    if (name === "get_user_tags") {
      const res = await axios.get(`${BASE_URL}/tags`);
      return formatResult(res.data);
    } 
    
    if (name === "create_task") {
      const payload = {
        title: args.title,
        priority: args.priority || 'medium',
        recurrence: args.recurrence || 'none',
      };
      if (args.due_date) payload.due_date = args.due_date;
      if (args.subtasks) payload.subtasks = args.subtasks;
      if (args.tags) payload.tags = args.tags;

      const res = await axios.post(`${BASE_URL}/tasks`, payload);
      return formatResult({ message: "Task created", data: res.data });
    } 
    
    if (name === "update_task") {
      const payload = {};
      if (args.title) payload.title = args.title;
      if (args.priority) payload.priority = args.priority;
      if (args.due_date) payload.due_date = args.due_date;
      if (args.recurrence) payload.recurrence = args.recurrence;

      if (Object.keys(payload).length === 0) {
        throw new Error("No fields provided to update");
      }

      const res = await axios.put(`${BASE_URL}/tasks/${args.task_id}`, payload);
      return formatResult({ message: "Task updated", data: res.data });
    } 
    
    if (name === "add_task_progress_note") {
      const results = [];
      const taskId = args.task_id;
      
      // 添加 note
      const noteRes = await axios.post(`${BASE_URL}/tasks/${taskId}/notes`, {
        content: args.note_content,
        source: 'ai'
      });
      results.push({ action: "note_added", data: noteRes.data });

      // 更新 subtasks
      if (args.complete_subtasks && args.complete_subtasks.length > 0) {
        for (const sid of args.complete_subtasks) {
          await axios.put(`${BASE_URL}/tasks/${taskId}/subtasks/${sid}`, { completed: true });
        }
        results.push({ action: "subtasks_completed", ids: args.complete_subtasks });
      }

      // 更新主状态
      if (args.task_status) {
        await axios.put(`${BASE_URL}/tasks/${taskId}`, { status: args.task_status });
        results.push({ action: "status_updated", status: args.task_status });
      }

      return formatResult({ message: "Progress recorded", actions: results });
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return {
      content: [{ type: "text", text: `Error: ${errorMsg}` }],
      isError: true
    };
  }
});

// --- PROMPTS 注册与实施 ---
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "agenttodo-skill-workflow",
        description: "包含使用 AgentTODO 系统的建议能力规范，加载这个 prompt 可以使 AI 即刻知晓如何调用任务系统。",
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "agenttodo-skill-workflow") {
    return {
      description: "AgentTODO 代理技能准则",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `你已挂载了「AgentTODO」任务库。
【工作职责准则】
1. 每天第一次对话或当我问及日程时，静默调用 get_daily_summary 或 get_today_agenda。
2. 当我口述大目标（如：“准备下周旅游”），你应将其在心中拆分成3-5个子步骤，向我确认后并使用 subtasks 参数一并写入 create_task。
3. 当我对你普通闲聊表达了某个任务的进展，你需要立刻主动使用 add_task_progress_note 将该沟通作为日志附在任务上，并自动勾掉对应的子任务或状态。
无需告诉我你执行了什么代码指令，要像真人老练助理一样自然对话。`
          }
        }
      ]
    };
  }
  throw new Error("Prompt not found");
});

function formatResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}

// 启动服务器
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AgentTODO MCP Server running on stdio");
}

run().catch(console.error);
