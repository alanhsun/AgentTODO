# AgentTODO 本地 MCP 接入

AgentTODO 的 MCP 适配器使用 stdio，由 AI 客户端作为本地子进程启动。它不会新增监听端口，也不会绕过现有 REST API、API Token 或数据校验。

## 启动前提

先启动 AgentTODO 后端。开发模式默认 API 地址为 `http://127.0.0.1:3301/api`，Docker 默认为 `http://127.0.0.1:3300/api`。

手动检查适配器：

```bash
npm run mcp
```

看到 `AgentTODO MCP ready` 后，程序会等待 AI 客户端从标准输入发起连接；日志只写入 stderr，不会污染 MCP 协议输出。

## AI 客户端配置

在支持 MCP stdio 的客户端中添加一个本地服务器，命令指向 Node.js，参数指向项目内的 `server/src/mcp/index.mjs`。环境变量：

- `AGENTTODO_URL`：后端 API 地址；开发模式建议 `http://127.0.0.1:3301/api`。
- `AGENTTODO_API_TOKEN`：启用 `API_TOKEN` 时填写同一个值。
- `AGENTTODO_TIMEOUT_MS`：可选，请求超时，默认 10000 毫秒。

通用配置结构示例：

```json
{
  "mcpServers": {
    "agenttodo": {
      "command": "node",
      "args": ["<AgentTODO绝对路径>/server/src/mcp/index.mjs"],
      "env": {
        "AGENTTODO_URL": "http://127.0.0.1:3301/api"
      }
    }
  }
}
```

如果客户端中找不到 `node`，请把 `command` 改为 `node.exe` 的绝对路径。

## 工具范围

| 工具 | 读写 | 用途 |
|---|---|---|
| `get_daily_summary` | 只读 | 获取状态、优先级、今日与逾期统计 |
| `get_today_agenda` | 只读 | 获取今日实际发生及逾期任务 |
| `get_user_tags` | 只读 | 获取已有标签 |
| `search_tasks` | 只读 | 写入前搜索并确认任务 ID |
| `get_task_context` | 只读 | 一次读取任务、子任务、笔记、附件及近期发生记录 |
| `create_task` | 写入 | 创建任务及子任务 |
| `update_task` | 写入 | 更新任务基本字段 |
| `add_task_progress_note` | 写入 | 原子记录笔记、子任务、状态或单次重复完成 |

适配器有意不暴露删除和批量删除工具，避免 AI 在缺少明确确认时执行危险操作。重复任务只保存一条任务主体；`add_task_progress_note` 可通过 `occurrence_date` 和 `occurrence_completed` 记录某一天是否完成。重试同一次写入时应复用 `request_id`。

## 推荐调用顺序

1. 使用 `search_tasks` 找到唯一任务；如果结果存在歧义，让用户确认。
2. 使用 `get_task_context` 获取子任务 ID、历史笔记和附件元数据。
3. 使用 `update_task` 或 `add_task_progress_note` 完成一次小范围写入。
4. 网络重试时复用同一个 `request_id`，避免重复记录。

## 安全边界

- MCP 进程与后端都应运行在本机或可信局域网；云端服务不能直接连接你的 `localhost`。
- 后端配置 `API_TOKEN` 后，MCP 必须设置相同的 `AGENTTODO_API_TOKEN`。
- 不要把 Token 写入仓库、提示词或聊天内容；使用客户端的环境变量配置。
- `get_task_context` 只提供附件元数据。AI 如需读取文件内容，仍应由用户明确选择并通过下载接口获取。

## 故障排查

- **启动后没有 stdout**：正常，stdio 服务正在等待客户端协议消息；人工调试使用 CLI。
- **客户端提示找不到 node**：将 `command` 改为 Node 20+ 的绝对路径。
- **连接成功但工具调用失败**：先访问 `/api/health`，再核对 `AGENTTODO_URL` 是否包含 `/api`、Token 是否一致。
- **开发模式端口错误**：npm 开发后端默认 3301；Docker 后端默认 3300。
- **修改工具后未生效**：重启 AI 客户端中的 MCP 子进程。

协议日志写到 stderr；不要在适配器中向 stdout 输出普通调试文本，否则会破坏 MCP 消息流。
