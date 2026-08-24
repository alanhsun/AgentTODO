const axios = require('axios');
const { getDb } = require('../db');
const config = require('../config');
const { validateWebhookUrl, createWebhookLookup } = require('../utils/webhookUrl');

async function triggerWebhook(event, payload) {
  try {
    const db = getDb();
    const webhooks = await db('webhooks').where('is_active', true);

    for (const hook of webhooks) {
      // 简单支持 JSON 数组检查
      let eventsArray = [];
      try {
        eventsArray = (typeof hook.events === 'string') ? JSON.parse(hook.events) : hook.events;
      } catch (e) {
        eventsArray = [];
      }

      if (eventsArray.includes(event) || eventsArray.includes('*')) {
        let validatedUrl;
        try {
          validatedUrl = await validateWebhookUrl(hook.url, {
            allowPrivateNetwork: config.webhookAllowPrivateNetwork,
            allowedHosts: config.webhookAllowedHosts,
          });
        } catch (validationError) {
          console.warn(`Webhook blocked [${hook.name}]:`, validationError.message);
          continue;
        }

        await axios.post(validatedUrl, {
          event,
          timestamp: new Date().toISOString(),
          data: payload
        }, {
          timeout: 5000,
          maxRedirects: 0,
          maxContentLength: 1024 * 1024,
          maxBodyLength: 1024 * 1024,
          proxy: false,
          lookup: createWebhookLookup({ allowPrivateNetwork: config.webhookAllowPrivateNetwork }),
        }).catch(e => console.warn(`Webhook failed [${hook.name}]:`, e.message));
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
}

module.exports = { triggerWebhook };
