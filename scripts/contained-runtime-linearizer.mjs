export function createContainedRuntimeLinearizer() {
  let tail = Promise.resolve();

  return Object.freeze({
    run(task) {
      if (typeof task !== "function") {
        return Promise.reject(
          new Error("contained runtime linearized task is invalid"),
        );
      }
      const current = tail.then(task, task);
      tail = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    },
  });
}
