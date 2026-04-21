import { sweepExpired } from "../src/lib/sweep";

type SweepEnv = {
  FILES: R2Bucket;
  DB: D1Database;
};

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sweepExpired(env, Math.floor(Date.now() / 1000)));
  },
  async fetch() {
    return new Response("filebundle sweep worker", { status: 200 });
  },
} satisfies ExportedHandler<SweepEnv>;
