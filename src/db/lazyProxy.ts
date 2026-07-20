/** Defer initialization until first property access (avoids connect-on-import). */
export function createLazyProxy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const target = getTarget();
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
}
