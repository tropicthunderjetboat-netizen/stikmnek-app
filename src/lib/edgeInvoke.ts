import { supabase, getEdgeAuthHeaders } from '@/lib/supabase';

/** Cold starts / large payloads — bounded wait on functions.invoke (fetch respects signal) */
export const EDGE_INVOKE_TIMEOUT_MS = 120_000;
/** Avoid indefinite wait if auth lock / session read stalls */
export const EDGE_AUTH_HEADER_MS = 20_000;
/** insert_pending_business RPC — PostgREST must not hang forever */
export const RPC_INSERT_PENDING_TIMEOUT_MS = 90_000;

export type InvokeEdgeOptions = {
  maxRetries?: number;
  label?: string;
  authHeaderMs?: number;
  invokeTimeoutMs?: number;
  logPrefix?: string;
};

/**
 * Shared pattern: race auth headers, abortable invoke, retries with backoff.
 * Use this for manage-business and similar long-running edge calls so dashboard + form stay in sync.
 */
export async function invokeEdgeFunctionWithRetry(
  fnName: string,
  body: Record<string, unknown>,
  options: InvokeEdgeOptions = {},
): Promise<{ data: any; error: any }> {
  const maxRetries = options.maxRetries ?? 2;
  const label = options.label ?? '';
  const authMs = options.authHeaderMs ?? EDGE_AUTH_HEADER_MS;
  const invokeMs = options.invokeTimeoutMs ?? EDGE_INVOKE_TIMEOUT_MS;
  const logPrefix = options.logPrefix ?? '[edge]';

  let lastError: any = null;
  let lastData: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 500 * attempt;
        console.log(`${logPrefix} ${label} Retry ${attempt}/${maxRetries} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
      const startMs = Date.now();
      const headers = await Promise.race([
        getEdgeAuthHeaders(),
        new Promise<Record<string, string>>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `${label || fnName}: session lookup timed out — sign out and sign in, then retry`,
                ),
              ),
            authMs,
          ),
        ),
      ]);
      const invokeAborter = new AbortController();
      const invokeTimer = setTimeout(() => invokeAborter.abort(), invokeMs);
      let result: { data: any; error: any };
      try {
        result = await supabase.functions.invoke(fnName, {
          body,
          headers,
          signal: invokeAborter.signal,
        });
      } finally {
        clearTimeout(invokeTimer);
      }
      const elapsed = Date.now() - startMs;
      console.log(`${logPrefix} ${label} ${fnName} attempt ${attempt}: ${elapsed}ms`, {
        hasData: !!result.data,
        hasError: !!result.error,
        dataError: result.data?.error,
      });
      if (result.error) {
        lastError = result.error;
        lastData = result.data ?? lastData;
        console.warn(`${logPrefix} ${label} Edge function error:`, result.error.message || result.error);
        continue;
      }
      if (result.data?.error) {
        lastError = new Error(result.data.error);
        lastData = result.data;
        console.warn(`${logPrefix} ${label} Server error:`, result.data.error);
        continue;
      }
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`${logPrefix} ${label} attempt ${attempt} threw:`, err?.message);
    }
  }
  return { data: lastData, error: lastError };
}
