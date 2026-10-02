/**
 * The opt-in client-side request throttle.
 *
 * Fixed-interval spacing: request starts are at least `60_000 /
 * requestsPerMinute` ms apart, which is a token bucket of capacity 1 — no
 * burst is ever allowed, so a queue of waiters drains at an even pace. Waiters
 * are served strictly first in, first out.
 *
 * The throttle bounds only the client instance that owns it. The vendor's
 * limit is per customer and shared by every token, process, and integration,
 * so this cannot guarantee compliance on its own.
 *
 * Nothing here is public API.
 */

/** One queued {@link Throttle.acquire} call. */
interface Waiter {
  readonly resolve: () => void;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: () => void;
}

/** Spaces request starts at least `60_000 / requestsPerMinute` ms apart. */
export class Throttle {
  /** The minimum gap between two granted slots, in milliseconds. */
  readonly intervalMs: number;
  /** The earliest time the next slot may be granted (a `Date.now()` value). */
  #nextAt = Number.NEGATIVE_INFINITY;
  readonly #queue: Waiter[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(requestsPerMinute: number) {
    this.intervalMs = 60_000 / requestsPerMinute;
  }

  /**
   * Wait for the next slot. Resolves when the caller may send its request, and
   * the slot counts as spent from that moment. If `signal` aborts first, the
   * caller leaves the queue at once without consuming a slot, and the promise
   * rejects with `signal.reason`, unchanged.
   */
  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        signal,
        onAbort: () => {
          const index = this.#queue.indexOf(waiter);
          if (index !== -1) this.#queue.splice(index, 1);
          if (this.#queue.length === 0) this.#clearTimer();
          reject(signal?.reason);
        },
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.#queue.push(waiter);
      if (this.#timer === undefined) this.#drain();
    });
  }

  /** Grant every slot that is due, then arm one timer for the next, if any. */
  #drain(): void {
    this.#clearTimer();
    for (;;) {
      const waiter = this.#queue[0];
      if (!waiter) return;
      const now = Date.now();
      if (now < this.#nextAt) {
        this.#timer = setTimeout(
          () => {
            this.#timer = undefined;
            this.#drain();
          },
          Math.ceil(this.#nextAt - now),
        );
        return;
      }
      this.#queue.shift();
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      this.#nextAt = now + this.intervalMs;
      waiter.resolve();
    }
  }

  #clearTimer(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
