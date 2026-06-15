/** ES2020-safe Promise.any — resolves with the first fulfilled promise. */
export function promiseAny<T>(promises: readonly PromiseLike<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) {
      reject(new Error("No promises"));
      return;
    }
    let rejected = 0;
    for (const p of promises) {
      Promise.resolve(p).then(resolve, () => {
        rejected += 1;
        if (rejected === promises.length) reject(new Error("All promises rejected"));
      });
    }
  });
}
