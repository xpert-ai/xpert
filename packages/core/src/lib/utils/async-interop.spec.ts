import { observableToAsyncIterator, asyncIteratorToObservable } from './async-interop';
import { of, throwError, Subject } from 'rxjs';


// Using asyncIterator (e.g. in an asynchronous function)
describe('observableToAsyncIterator', () => {
  it('should yield all values from observable', async () => {
    const obs$ = of(1, 2, 3);
    const asyncIter = observableToAsyncIterator(obs$);

    const results: number[] = [];
    for await (const val of asyncIter) {
      results.push(val);
    }
    expect(results).toEqual([1, 2, 3]);
  });

  it('should handle observable completion', async () => {
    const obs$ = of(42);
    const asyncIter = observableToAsyncIterator(obs$);

    const { value, done } = await asyncIter.next();
    expect(value).toBe(42);
    expect(done).toBe(false);

    const res = await asyncIter.next();
    expect(res.done).toBe(true);
  });

  it('should handle observable errors', async () => {
    const obs$ = throwError(() => new Error('fail'));
    const asyncIter = observableToAsyncIterator(obs$);

    await expect(asyncIter.next()).rejects.toThrow('fail');
  });

  it('should allow early return (unsubscribe)', async () => {
    const subj = new Subject<number>();
    const asyncIter = observableToAsyncIterator(subj);

    subj.next(1);
    const { value } = await asyncIter.next();
    expect(value).toBe(1);

    await asyncIter.return();
    expect(subj.observed).toBe(false);
  });
});

describe('asyncIteratorToObservable', () => {
  it('should emit all values from async iterator', done => {
    async function* gen() {
      yield 10;
      yield 20;
      yield 30;
    }
    const obs$ = asyncIteratorToObservable(gen());
    const results: number[] = [];
    obs$.subscribe({
      next: v => results.push(v),
      complete: () => {
        expect(results).toEqual([10, 20, 30]);
        done();
      }
    });
  });

  it('should complete when async iterator completes', done => {
    async function* gen() {
      yield 1;
    }
    const obs$ = asyncIteratorToObservable(gen());
    let completed = false;
    obs$.subscribe({
      complete: () => {
        completed = true;
        expect(completed).toBe(true);
        done();
      }
    });
  });

  it('should error if async iterator throws', done => {
    // eslint-disable-next-line require-yield
    async function* gen() {
      throw new Error('iterator error');
    }
    const obs$ = asyncIteratorToObservable(gen());
    obs$.subscribe({
      error: err => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('iterator error');
        done();
      }
    });
  });
});
