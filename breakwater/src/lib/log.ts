// src/lib/log.ts
export function log(tag: string, meta: Record<string, any> = {}) {
  console.log(`[${tag}]`, JSON.stringify(meta));
}

export function logError(tag: string, err: any, meta: Record<string, any> = {}) {
  console.error(
    `[${tag}]`,
    JSON.stringify({
      ...meta,
      error: err?.response?.data || err?.message || String(err),
    })
  );
}
