import { deleteBundle, listExpiredBundleIds } from "@/lib/db";
import { deleteFilesWithPrefix } from "@/lib/r2";

const BATCH_SIZE = 100;

export interface SweepEnv {
  FILES: R2Bucket;
  DB: D1Database;
}

export async function sweepExpired(env: SweepEnv, now: number): Promise<number> {
  let totalDeleted = 0;
  for (let i = 0; i < 50; i += 1) {
    const ids = await listExpiredBundleIds(env.DB, now, BATCH_SIZE);
    if (ids.length === 0) break;
    for (const id of ids) {
      await deleteFilesWithPrefix(env.FILES, `bundles/${id}/`);
      await deleteBundle(env.DB, id);
      totalDeleted += 1;
    }
  }
  return totalDeleted;
}
