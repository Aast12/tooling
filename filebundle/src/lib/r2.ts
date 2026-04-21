export async function putFile(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream | ArrayBuffer | Blob,
  mime: string | null,
): Promise<void> {
  await bucket.put(key, body as ReadableStream, {
    httpMetadata: mime ? { contentType: mime } : undefined,
  });
}

export async function getFile(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

export async function deleteFilesWithPrefix(
  bucket: R2Bucket,
  prefix: string,
): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const listing = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = listing.objects.map((o) => o.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return deleted;
}
