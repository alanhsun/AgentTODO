const cron = require('node-cron');
const { getDb } = require('./db');
const { triggerWebhook } = require('./services/webhookService');
const config = require('./config');
const { dateInTimeZone } = require('./utils/date');

function initWorkers() {
  console.log('Webhook worker initialized: listening for overdue tasks');

  // 每天早上 9:00 (也可以改成每小时 0 * * * *) 检查一次过期任务
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[CronWorker] Running overdue task check...');
      const db = getDb();
      const today = dateInTimeZone(new Date(), config.appTimezone);

      const overdueTasks = await db('tasks')
        .where('status', '!=', 'done')
        .whereNotNull('due_date')
        .where('due_date', '<', today);

      if (overdueTasks.length > 0) {
        console.log(`[CronWorker] Found ${overdueTasks.length} overdue tasks.`);
        // 推送给 AI: "老板，你昨天有些任务没做完！"
        await triggerWebhook('task.overdue', {
          count: overdueTasks.length,
          tasks: overdueTasks
        });
      }
    } catch (e) {
      console.error('[CronWorker] Error:', e.message);
    }
  }, { timezone: config.appTimezone });

  // 每5分钟检查是否有将于 1 小时内到期的任务 (假设增加 due_time 字段或高频扫描，这里仅示范全盘扫描不频繁)
}

module.exports = { initWorkers };
