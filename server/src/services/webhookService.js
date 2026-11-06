const axios = require('axios');
const { getDb } = require('../db');
const config = require('../config');

const WEBHOOK_EVENTS = ['task.created', 'task.updated', 'task.completed', 'task.deleted', 'task.overdue'];
const DEFAULT_EVENTS = ['task.created', 'task.updated', 'task.overdue'];

// 追踪尚未完成的推送，便于优雅退出 / 测试时等待
const pending = new Set();

function parseEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/** 将数据库行转为对外输出格式（events 解析为数组、is_active 转为布尔值） */
function serializeWebhook(hook) {
  if (!hook) return hook;
  return { ...hook, events: parseEvents(hook.events), is_active: Boolean(hook.is_active) };
}

async function deliver(event, payload) {
  try {
    const db = getDb();
    const hooks = await db('webhooks').where('is_active', true);
    const targets = hooks.filter((hook) => {
      const events = parseEvents(hook.events);
      return events.includes(event) || events.includes('*');
    });

    await Promise.all(targets.map((hook) =>
      axios.post(hook.url, {
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      }, {
        timeout: config.webhookTimeout,
        headers: { 'X-AgentTODO-Event': event },
      }).catch((e) => console.warn(`Webhook failed [${hook.name}] ${event}:`, e.message))
    ));
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
}

/**
 * 触发 Webhook（不阻塞调用方）。
 * 返回的 Promise 永远不会 reject。
 */
function triggerWebhook(event, payload) {
  const p = deliver(event, payload);
  pending.add(p);
  p.finally(() => pending.delete(p));
  return p;
}

/** 等待所有正在进行的推送完成（用于优雅退出与测试） */
async function flushWebhooks() {
  while (pending.size > 0) {
    await Promise.all([...pending]);
  }
}

module.exports = {
  triggerWebhook,
  flushWebhooks,
  parseEvents,
  serializeWebhook,
  WEBHOOK_EVENTS,
  DEFAULT_EVENTS,
};
