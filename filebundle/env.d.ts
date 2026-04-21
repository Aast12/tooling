/// <reference path="./.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  FILES: R2Bucket;
  DB: D1Database;
  UPLOAD_PASSWORD: string;
  SESSION_SECRET: string;
}

declare namespace App {
  interface Locals {
    authed: boolean;
    runtime: {
      env: Env;
      ctx: ExecutionContext;
      cf?: IncomingRequestCfProperties;
    };
  }
}
