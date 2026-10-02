import { describe, it, expect, vi } from "vitest";

import { proxy, snapshot, subscribe } from "./proxy";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("proxy: reads and writes", () => {
  it("reads back what you write", () => {
    const state = proxy({ count: 0, label: "a" });
    state.count = 1;
    expect(state.count).toBe(1);
    expect(state.label).toBe("a");
  });

  it("does not mutate the object you passed in", () => {
    const initial = { count: 0 };
    const state = proxy(initial);
    state.count = 5;
    expect(initial.count).toBe(0);
    expect(state).not.toBe(initial);
  });

  it("returns undefined for a key that was never set", () => {
    const state = proxy<{ a: number; missing?: string }>({ a: 1 });
    expect(state.missing).toBeUndefined();
    expect("missing" in state).toBe(false);
  });

  it("behaves like a plain object for keys, spread, in, and delete", () => {
    const state = proxy<{ a: number; b?: number }>({ a: 1, b: 2 });
    expect(Object.keys(state)).toEqual(["a", "b"]);
    expect({ ...state }).toEqual({ a: 1, b: 2 });
    expect("b" in state).toBe(true);

    delete state.b;
    expect("b" in state).toBe(false);
    expect(Object.keys(state)).toEqual(["a"]);
  });

  it("keeps methods callable, with `this` bound to the proxy", () => {
    const state = proxy({
      count: 0,
      increment() {
        this.count += 1;
      },
    });
    state.increment();
    expect(state.count).toBe(1);
    expect(snapshot(state).count).toBe(1);
  });
});

describe("snapshot: immutability", () => {
  it("is frozen and throws on write", () => {
    const state = proxy({ count: 1 });
    const snap = snapshot(state);
    expect(Object.isFrozen(snap)).toBe(true);
    // Test files are ESM, so strict mode applies: this must throw.
    expect(() => {
      (snap as { count: number }).count = 2;
    }).toThrow();
  });

  it("is a plain copy, not the proxy", () => {
    const state = proxy({ count: 1 });
    const snap = snapshot(state);
    expect(snap).not.toBe(state);
    expect(snap).toEqual({ count: 1 });
  });

  it("does not see mutations made after it was taken", () => {
    const state = proxy<{ count: number; added?: number }>({ count: 0 });
    const before = snapshot(state);

    state.count = 1;
    state.added = 9;

    expect(before.count).toBe(0);
    expect("added" in before).toBe(false);
    expect(snapshot(state)).toEqual({ count: 1, added: 9 });
  });
});

describe("snapshot: version cache", () => {
  it("returns the identical object when nothing changed", () => {
    const state = proxy({ a: 1 });
    expect(snapshot(state)).toBe(snapshot(state));
  });

  it("returns a new object after a real write", () => {
    const state = proxy({ a: 1 });
    const first = snapshot(state);
    state.a = 2;
    expect(snapshot(state)).not.toBe(first);
  });

  it("does not bump the version for an Object.is-equal write", () => {
    const state = proxy({ a: 1, s: "x", nan: Number.NaN });
    const first = snapshot(state);

    state.a = 1;
    state.s = "x";
    state.nan = Number.NaN;

    expect(snapshot(state)).toBe(first);
  });

  it("bumps the version for adding and deleting keys", () => {
    const state = proxy<{ a: number; b?: number }>({ a: 1 });
    const first = snapshot(state);

    state.b = 2;
    const second = snapshot(state);
    expect(second).not.toBe(first);

    delete state.b;
    expect(snapshot(state)).not.toBe(second);
    expect(snapshot(state)).toEqual({ a: 1 });
  });

  it("distinguishes an explicit undefined from a deleted key", () => {
    const state = proxy<{ a?: number }>({ a: 1 });
    state.a = undefined;
    const withUndefined = snapshot(state);
    expect("a" in withUndefined).toBe(true);

    delete state.a;
    const deleted = snapshot(state);
    expect(deleted).not.toBe(withUndefined);
    expect("a" in deleted).toBe(false);
  });
});

describe("subscribe", () => {
  it("notifies after a mutation, not before", async () => {
    const state = proxy({ count: 0 });
    const spy = vi.fn();
    subscribe(state, spy);

    state.count = 1;
    expect(spy).not.toHaveBeenCalled(); // batched, so not yet

    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("batches synchronous mutations into a single notification", async () => {
    const state = proxy<{ a: number; b: number; c?: number }>({ a: 0, b: 0 });
    const spy = vi.fn();
    subscribe(state, spy);

    state.a = 1;
    state.b = 2;
    state.c = 3;
    delete state.c;

    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not notify on a no-op write", async () => {
    const state = proxy({ count: 0 });
    const spy = vi.fn();
    subscribe(state, spy);

    state.count = 0;
    await tick();
    expect(spy).not.toHaveBeenCalled();
  });

  it("sees current state from inside the callback", async () => {
    const state = proxy({ count: 0 });
    const seen: number[] = [];
    subscribe(state, () => {
      seen.push(snapshot(state).count);
    });

    state.count = 1;
    await tick();
    expect(seen).toEqual([1]);
  });

  it("stops notifying after unsubscribe", async () => {
    const state = proxy({ count: 0 });
    const spy = vi.fn();
    const unsubscribe = subscribe(state, spy);

    unsubscribe();
    state.count = 1;
    await tick();
    expect(spy).not.toHaveBeenCalled();
  });

  it("is idempotent on repeated unsubscribe", async () => {
    const state = proxy({ count: 0 });
    const spy = vi.fn();
    const unsubscribe = subscribe(state, spy);

    unsubscribe();
    unsubscribe();
    state.count = 1;
    await tick();
    expect(spy).not.toHaveBeenCalled();
  });

  it("supports multiple independent subscribers", async () => {
    const state = proxy({ count: 0 });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(state, first);
    subscribe(state, second);

    state.count = 1;
    await tick();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    state.count = 2;
    await tick();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("schedules a fresh flush when a listener mutates state", async () => {
    const state = proxy({ a: 0, b: 0 });
    let calls = 0;
    subscribe(state, () => {
      calls += 1;
      if (calls === 1) state.b = 1;
    });

    state.a = 1;
    await tick();

    // First flush for `a`, second for the `b` written during that flush. No more.
    expect(calls).toBe(2);
    expect(state.b).toBe(1);
  });

  it("does not notify a subscriber that unsubscribed during the same flush", async () => {
    const state = proxy({ count: 0 });
    const second = vi.fn();
    subscribe(state, () => unsubscribeSecond());
    const unsubscribeSecond = subscribe(state, second);

    state.count = 1;
    await tick();
    expect(second).not.toHaveBeenCalled();
  });
});
