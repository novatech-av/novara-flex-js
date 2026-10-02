import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Throttle } from "./throttle.js";

describe("Throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Acquire a slot, recording `label` and the time it was granted. */
  function acquireInto(
    throttle: Throttle,
    starts: Array<[string, number]>,
    label: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return throttle.acquire(signal).then(
      () => {
        starts.push([label, Date.now()]);
      },
      (error: unknown) => error,
    );
  }

  it("spaces slots 60_000 / requestsPerMinute ms apart", async () => {
    const throttle = new Throttle(40);
    expect(throttle.intervalMs).toBe(1_500);
    const starts: Array<[string, number]> = [];
    const t0 = Date.now();
    void acquireInto(throttle, starts, "a");
    void acquireInto(throttle, starts, "b");
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([["a", t0]]);
    await vi.advanceTimersByTimeAsync(1_499);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      ["a", t0],
      ["b", t0 + 1_500],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("grants at once when the last slot is an interval old", async () => {
    const throttle = new Throttle(60);
    const starts: Array<[string, number]> = [];
    await acquireInto(throttle, starts, "a");
    await vi.advanceTimersByTimeAsync(5_000);
    const t = Date.now();
    await acquireInto(throttle, starts, "b");
    expect(starts[1]).toEqual(["b", t]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("serves waiters first in, first out", async () => {
    const throttle = new Throttle(600); // 100 ms apart
    const starts: Array<[string, number]> = [];
    const labels = ["a", "b", "c", "d", "e"];
    for (const label of labels) void acquireInto(throttle, starts, label);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(starts.map(([label]) => label)).toEqual(labels);
  });

  it("drains a burst of 3N at N = 6/min at least 10 s apart, finishing every one", async () => {
    const throttle = new Throttle(6);
    const starts: Array<[string, number]> = [];
    const all = Array.from({ length: 18 }, (_, i) =>
      acquireInto(throttle, starts, String(i)),
    );
    await vi.advanceTimersByTimeAsync(17 * 10_000);
    await Promise.all(all);

    expect(starts.map(([label]) => label)).toEqual(
      Array.from({ length: 18 }, (_, i) => String(i)),
    );
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i]?.[1] ?? 0) - (starts[i - 1]?.[1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(10_000);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops an aborted waiter at once, with its reason, without spending a slot", async () => {
    const throttle = new Throttle(60); // 1 s apart
    const starts: Array<[string, number]> = [];
    const t0 = Date.now();
    const controller = new AbortController();
    void acquireInto(throttle, starts, "a");
    const b = acquireInto(throttle, starts, "b", controller.signal);
    void acquireInto(throttle, starts, "c");
    await vi.advanceTimersByTimeAsync(500);

    const reason = new Error("caller gave up");
    controller.abort(reason);
    expect(await b).toBe(reason);
    await vi.advanceTimersByTimeAsync(500);
    // `c` moves up into `b`'s place rather than waiting behind it.
    expect(starts).toEqual([
      ["a", t0],
      ["c", t0 + 1_000],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an already aborted signal without queueing", async () => {
    const throttle = new Throttle(60);
    const controller = new AbortController();
    controller.abort();
    await expect(throttle.acquire(controller.signal)).rejects.toBe(
      controller.signal.reason,
    );
    // The first real waiter still gets its slot at once.
    const starts: Array<[string, number]> = [];
    const t = Date.now();
    await acquireInto(throttle, starts, "a");
    expect(starts).toEqual([["a", t]]);
  });

  it("leaves no timer behind when the last waiter aborts", async () => {
    const throttle = new Throttle(60);
    await throttle.acquire();
    const controller = new AbortController();
    const pending = throttle.acquire(controller.signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await pending;
    expect(vi.getTimerCount()).toBe(0);

    // The aborted waiter spent nothing: the next slot is still due 1 s after
    // the first.
    await vi.advanceTimersByTimeAsync(1_000);
    const starts: Array<[string, number]> = [];
    const t = Date.now();
    await acquireInto(throttle, starts, "next");
    expect(starts).toEqual([["next", t]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("has no timer running while idle", async () => {
    const throttle = new Throttle(6);
    expect(vi.getTimerCount()).toBe(0);
    await throttle.acquire();
    expect(vi.getTimerCount()).toBe(0);
  });
});
