export type Snapshot<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: Snapshot<T[K]> }
    : T;

export function proxy<T extends object>(_initial: T): T {
  throw new Error("not implemented: proxy");
}

export function snapshot<T extends object>(_p: T): Snapshot<T> {
  throw new Error("not implemented: snapshot");
}

export function subscribe(_p: object, _cb: () => void): () => void {
  throw new Error("not implemented: subscribe");
}
