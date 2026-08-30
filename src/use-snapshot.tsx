import type { Snapshot } from "./proxy";

export function useSnapshot<T extends object>(_p: T): Snapshot<T> {
  throw new Error("not implemented: useSnapshot");
}
