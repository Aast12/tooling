export function createFakeR2(): R2Bucket {
  const objects = new Map<string, ArrayBuffer>();

  const bucket = {
    async put(
      key: string,
      body: ReadableStream | ArrayBuffer | Uint8Array | Blob | string,
    ) {
      let buf: ArrayBuffer;
      if (typeof body === "string") {
        buf = new TextEncoder().encode(body).buffer as ArrayBuffer;
      } else if (body instanceof ArrayBuffer) {
        buf = body;
      } else if (body instanceof Uint8Array) {
        buf = body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        ) as ArrayBuffer;
      } else if (body instanceof Blob) {
        buf = await body.arrayBuffer();
      } else {
        buf = await new Response(body).arrayBuffer();
      }
      objects.set(key, buf);
      return { key } as R2Object;
    },
    async get(key: string) {
      const buf = objects.get(key);
      if (!buf) return null;
      return {
        key,
        body: new Response(buf).body,
        async arrayBuffer() {
          return buf;
        },
        async text() {
          return new TextDecoder().decode(buf);
        },
        httpMetadata: {},
      } as unknown as R2ObjectBody;
    },
    async list({ prefix }: { prefix?: string; cursor?: string; limit?: number }) {
      const keys = [...objects.keys()].filter((k) => !prefix || k.startsWith(prefix));
      return {
        objects: keys.map((key) => ({ key })),
        truncated: false,
        cursor: null,
      } as unknown as R2Objects;
    },
    async delete(keys: string[] | string) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) objects.delete(k);
    },
    __objects: objects,
  };

  return bucket as unknown as R2Bucket;
}

export function countObjects(bucket: R2Bucket): number {
  return (bucket as unknown as { __objects: Map<string, ArrayBuffer> }).__objects.size;
}
