// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Default output is static; routes opt in to on-demand rendering with `prerender = false`.
  adapter: cloudflare({
    // Local images are optimised at build time. No runtime Cloudflare Images binding
    // (avoids an extra billable resource); media variants are handled in Phase 5.
    imageService: { build: 'compile', runtime: 'passthrough' },
  }),
  // Auth is handled by Supabase, so Astro sessions (and their KV namespace) are not needed.
  session: false,
});
