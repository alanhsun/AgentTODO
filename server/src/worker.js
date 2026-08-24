const cron = require('node-cron');
const { getDb } = require('./db');
const { triggerWebhook } = require('./services/webhookService');
const config = require('./config');
const { dateInTimeZone } = require('./utils/date');
const { taskIsOverdueOnDate } = require('./utils/recurrence');

function initWorkers() {
  console.log('Webhook worker initialized: listening for overdue tasks');

  // 每天早上 9:00 (也可以改成每小时 0 * * * *) 检查一次过期任务
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[CronWorker] Running overdue task check...');
      const db = getDb();
      const today = dateInTimeZone(new Date(), config.appTimezone);

      const activeTasks = await db('tasks').where('status', '!=', 'done');
      const overdueTasks = activeTasks.filter((task) => taskIsOverdueOnDate(task, today));

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
}

module.exports = { initWorkers };
