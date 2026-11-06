/**
 * 轻量级 SSE（Server-Sent Events）实时事件广播服务
 * 当任务、子任务、笔记、标签或备份发生变更时，向所有在线前端页面推送实时通知。
 */

const clients = new Set();
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL_MS = 25000;

function ensureHeartbeat() {
  if (heartbeatTimer || clients.size === 0) return;
  heartbeatTimer = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clients.delete(res);
      }
    }
    if (clients.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref();
  }
}

/**
 * Express 路由处理器：建立 SSE 长连接
 */
function subscribeEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const connectedPayload = JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
  });
  res.write(`data: ${connectedPayload}\n\n`);

  clients.add(res);
  ensureHeartbeat();

  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  });
}

/**
 * 向所有已连接的客户端广播数据变更事件
 * @param {string} type - 事件类型，如 'task.updated' | 'subtask.updated' | 'note.created'
 * @param {object} [meta] - 附加元数据（如 taskId）
 */
function broadcastEvent(type, meta = {}) {
  if (clients.size === 0) return;
  const payload = JSON.stringify({
    type,
    ...meta,
    timestamp: new Date().toISOString(),
  });
  const frame = `data: ${payload}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

/**
 * 优雅退出时主动关闭所有 SSE 连接，避免 server.close() 阻塞等待长连接断开
 */
function closeAllEventClients() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  for (const res of clients) {
    try {
      res.end();
    } catch {
      // ignore
    }
  }
  clients.clear();
}

module.exports = {
  subscribeEvents,
  broadcastEvent,
  closeAllEventClients,
};
