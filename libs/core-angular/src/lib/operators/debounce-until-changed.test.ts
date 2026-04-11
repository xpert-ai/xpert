import { TestScheduler } from 'rxjs/testing';
import { debounceUntilChanged } from './debounce-until-changed';

describe('debounceUntilChanged', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('should debounce values until the specified key changes', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const source = cold('  -a-b-c-d-e-f-g-h-|', {
        a: { key: 1 },
        b: { key: 1 },
        c: { key: 2 },
        d: { key: 2 },
        e: { key: 3 },
        f: { key: 3 },
        g: { key: 4 },
        h: { key: 4 }
      });
      const expected = '    -b---d---f---h---|';

      const result = source.pipe(debounceUntilChanged(20, 'key'));

      expectObservable(result).toBe(expected, {
        b: { key: 1 },
        d: { key: 2 },
        f: { key: 3 },
        h: { key: 4 }
      });
    });
  });

  it('should emit immediately if the first value is different', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const source = cold('  -a-b-c-|', {
        a: { key: 1 },
        b: { key: 2 },
        c: { key: 3 }
      });
      const expected = '     -a-b-c-|'; // 确保时间线与预期输出匹配
  
      const result = source.pipe(debounceUntilChanged(20, 'key',));

      expectObservable(result).toBe(expected, {
        a: { key: 1 },
        b: { key: 2 },
        c: { key: 3 }
      });
    });
  });

  it('should not emit if values do not change', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const source = cold('  -a-b-c-|', {
        a: { key: 1 },
        b: { key: 1 },
        c: { key: 1 }
      });
      const expected = '     -a-----|';

      const result = source.pipe(debounceUntilChanged(20, 'key',));

      expectObservable(result).toBe(expected, {
        a: { key: 1 }
      });
    });
  });
});
