import { handle } from '@astrojs/cloudflare/handler';
import { processEmailOutbox } from './lib/email';

export default {
  fetch: handle,
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(
      processEmailOutbox(env.DB, env).catch(() => {
        // Raw D1/provider errors can contain private data. Cron failure remains visible in Workers logs.
        console.error('email: scheduled processing failed');
        throw new Error('Email processing failed');
      }),
    );
  },
} satisfies ExportedHandler<Env>;
