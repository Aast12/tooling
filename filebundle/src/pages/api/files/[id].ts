import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getBundle, getItem } from "@/lib/db";
import { getFile } from "@/lib/r2";

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });
  const e = env as Env;

  const item = await getItem(e.DB, id);
  if (!item || item.kind !== "file" || !item.r2_key) {
    return new Response("not found", { status: 404 });
  }

  const now = Math.floor(Date.now() / 1000);
  const bundle = await getBundle(e.DB, item.bundle_id, now);
  if (!bundle) return new Response("not found", { status: 404 });

  const object = await getFile(e.FILES, item.r2_key);
  if (!object) return new Response("not found", { status: 404 });

  const headers = new Headers();
  if (item.mime) headers.set("Content-Type", item.mime);
  headers.set("Content-Length", String(item.size));
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodeFilename(item.name)}"`,
  );
  return new Response(object.body, { headers });
};

function encodeFilename(name: string): string {
  return name.replace(/"/g, "").replace(/[^\x20-\x7E]/g, "_");
}
