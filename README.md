# proxy-state kata

Build a tiny Valtio: a mutable proxy store plus a React hook that re-renders only
the components that read the keys that changed.

Tests are already written. Your job is to make them pass.

## Setup

```bash
pnpm install
pnpm test
```

## What to build

### `src/proxy.ts`

```ts
proxy<T extends object>(initial: T): T
snapshot<T extends object>(p: T): Snapshot<T>
subscribe(p: object, cb: () => void): () => void
```

- `proxy` wraps a copy of `initial`. Reads and writes behave like a plain object:
  spread, `in`, `Object.keys`, `delete`, methods with `this` bound to the proxy.
- `snapshot` returns a frozen plain copy. Same object identity while nothing
  changed; a new one after a real write. An `Object.is`-equal write is not a change.
  An explicit `undefined` is not the same as a deleted key.
- `subscribe` notifies asynchronously, after the mutation. Synchronous mutations
  in one tick collapse into one notification. Returns an idempotent unsubscribe.

### `src/use-snapshot.tsx`

```ts
useSnapshot<T extends object>(p: T): Snapshot<T>
```

Returns a snapshot and subscribes the component to the proxy. The hard part is
granularity: a component re-renders only when a key it actually read during its
last render changes.

- Untouched key changes → no re-render.
- A key read while still `undefined` is tracked.
- Key enumeration tracks the key set, not the values.
- Tracking resets every render, so a conditionally read key stops counting when
  it stops being read.
- A re-render from unrelated local state must not widen or lose tracking.
- Two components, two proxies, mount/unmount all stay independent and consistent.

## Rules

- Don't edit the tests.
- No `valtio` or other state libraries. Standard `Proxy` and React only.
- `pnpm build` and `pnpm lint` should stay clean.

## Suggested order

1. `src/proxy.test.ts` — reads/writes, snapshot immutability, version cache, subscribe.
2. `src/use-snapshot.test.tsx` — reactivity and lifecycle.
3. `src/use-snapshot.test.tsx` — tracking granularity.
