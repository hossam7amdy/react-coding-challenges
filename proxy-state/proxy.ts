export type Snapshot<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: Snapshot<T[K]> }
    : T;

type Subscriber = () => void;

const proxySubscribers = new WeakMap<object, Set<Subscriber>>();

const snapshotCache = new WeakMap<object, Snapshot<any>>();

const scheduledTasks = new WeakSet<object>();

function notify(p: object) {
  if (scheduledTasks.has(p)) {
    return;
  }

  scheduledTasks.add(p);
  queueMicrotask(() => {
    scheduledTasks.delete(p);

    for (const listener of proxySubscribers.get(p)!) {
      listener();
    }
  });
}

export function proxy<T extends object>(initial: T): T {
  const handler: ProxyHandler<T> = {
    set(target, property, newValue) {
      const oldValue = Reflect.get(target, property);
      if (Object.is(oldValue, newValue)) {
        return true;
      }

      notify(proxiedValue);
      snapshotCache.delete(proxiedValue);
      return Reflect.set(target, property, newValue);
    },
    deleteProperty(target, property) {
      notify(proxiedValue);
      snapshotCache.delete(proxiedValue);
      return Reflect.deleteProperty(target, property);
    },
  };

  const proxiedValue = new Proxy({ ...initial }, handler);
  proxySubscribers.set(proxiedValue, new Set());
  return proxiedValue;
}

export function snapshot<T extends object>(proxy: T): Snapshot<T> {
  if (snapshotCache.has(proxy)) {
    return snapshotCache.get(proxy);
  }

  const cachedSnapshot = Object.freeze({ ...proxy });
  snapshotCache.set(proxy, cachedSnapshot);
  return cachedSnapshot as Snapshot<T>;
}

export function subscribe(p: object, cb: Subscriber): () => void {
  const subscribers = proxySubscribers.get(p);
  if (!subscribers) {
    throw new Error("Invalid proxy");
  }
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
