/**
 * Run tasks with a maximum concurrency limit
 * @param tasks - Array of async functions (each returns a Promise)
 * @param maximum - Maximum concurrency
 */
export async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  maximum: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0; // next task index
  let running: Promise<void>[] = [];

  async function runTask(i: number) {
    const result = await tasks[i]();
    results[i] = result;
  }

  while (index < tasks.length) {
    while (running.length < maximum && index < tasks.length) {
      const currentIndex = index++;
      const taskPromise = runTask(currentIndex).then(() => {
        // remove finished promise
        running = running.filter(p => p !== taskPromise);
      });
      running.push(taskPromise);
    }
    // wait for at least one task to finish before scheduling next
    await Promise.race(running);
  }

  // wait all
  await Promise.all(running);
  return results;
}
