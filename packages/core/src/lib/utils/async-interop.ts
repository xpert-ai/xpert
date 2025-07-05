import { Observable } from 'rxjs';

export function observableToAsyncIterator<T>(obs$: Observable<T>): AsyncIterableIterator<T> {
  const queue: T[] = [];
  const waiting: ((res: IteratorResult<T>) => void)[] = [];
  let isDone = false;
  let error: any = null;

  const sub = obs$.subscribe({
    next: value => {
      if (waiting.length > 0) {
        waiting.shift()({ value, done: false });
      } else {
        queue.push(value);
      }
    },
    error: err => {
      error = err;
      while (waiting.length > 0) {
        waiting.shift()(err)
      }
    },
    complete: () => {
      isDone = true;
      while (waiting.length > 0) {
        waiting.shift()({ value: undefined as any, done: true });
      }
    }
  });

  return {
    [Symbol.asyncIterator]() { return this; },
    next(): Promise<IteratorResult<T>> {
      if (error) return Promise.reject(error);
      if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
      if (isDone) return Promise.resolve({ value: undefined as any, done: true });
      return new Promise(resolve => waiting.push(resolve));
    },
    return(): Promise<IteratorResult<T>> {
      sub.unsubscribe();
      return Promise.resolve({ value: undefined as any, done: true });
    }
  };
}

export function asyncIteratorToObservable<T>(iter: AsyncIterable<T>): Observable<T> {
  return new Observable<T>(subscriber => {
    (async () => {
      try {
        for await (const val of iter) {
          subscriber.next(val);
        }
        subscriber.complete();
      } catch (err) {
        subscriber.error(err);
      }
    })();
  });
}
