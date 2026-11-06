const cron = require('node-cron');
const config = require('./config');
const { getDb } = require('./db');
const { triggerWebhook } = require('./services/webhookService');
const { today: localToday } = require('./utils/date');

let overdueJob = null;

/** 查询逾期任务并推送 task.overdue 事件；导出以便测试和手动触发 */
async function checkOverdueTasks() {
  const db = getDb();
  const today = localToday();

  const overdueTasks = await db('tasks')
    .select('id', 'title', 'priority', 'status', 'due_date')
    .where('status', '!=', 'done')
    .whereNotNull('due_date')
    .where('due_date', '<', today)
    .orderBy('due_date', 'asc');

  if (overdueTasks.length > 0) {
    console.log(`[CronWorker] Found ${overdueTasks.length} overdue tasks.`);
    // 推送给 AI: "老板，你昨天有些任务没做完！"
    triggerWebhook('task.overdue', {
      date: today,
      count: overdueTasks.length,
      tasks: overdueTasks,
    });
  }
  return overdueTasks;
}

function initWorkers() {
  if (!cron.validate(config.overdueCron)) {
    console.error(`[CronWorker] Invalid OVERDUE_CRON expression "${config.overdueCron}", overdue checks disabled.`);
    return;
  }

  // 默认每天早上 9:00（服务器本地时区，可通过 TZ 环境变量设置）检查一次过期任务
  overdueJob = cron.schedule(config.overdueCron, async () => {
    try {
      console.log('[CronWorker] Running overdue task check...');
      await checkOverdueTasks();
    } catch (e) {
      console.error('[CronWorker] Error:', e.message);
    }
  });

  console.log(`Webhook worker initialized: overdue check scheduled at "${config.overdueCron}"`);
}

function stopWorkers() {
  if (overdueJob) {
    overdueJob.stop();
    overdueJob = null;
  }
}

module.exports = { initWorkers, stopWorkers, checkOverdueTasks };
