import { useEffect, useReducer } from "react";

import { snapshot, subscribe, type Snapshot } from "./proxy";

export function useSnapshot<T extends object>(p: T): Snapshot<T> {
  const [_, forceRender] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribe(p, forceRender), []);

  return snapshot(p);
}
