/**
 * Signal composition shared by the search chain and the reader chain.
 *
 * `AbortSignal.timeout` composes badly here — it produces an abort that is indistinguishable from the
 * caller's own, so a cancelled turn and an expired budget read as the same event. Keeping the two apart
 * is what lets the chain rethrow cancellation instead of reporting it as a provider failure.
 */

interface ComposedSignal {
  signal: AbortSignal;
  /** True when *our* budget expired, regardless of whether the caller also aborted. */
  timedOut: () => boolean;
  dispose: () => void;
}

export function withTimeout(timeoutMs: number, caller?: AbortSignal): ComposedSignal {
  const controller = new AbortController();
  let expired = false;

  const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
  const forward = () => controller.abort(caller?.reason);
  if (caller?.aborted) forward();
  else caller?.addEventListener('abort', forward, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', forward);
    },
  };
}