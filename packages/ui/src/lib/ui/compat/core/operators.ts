import { Observable, OperatorFunction } from 'rxjs'

export function debounceUntilChanged<T, K extends keyof T>(dueTime: number, key?: K): OperatorFunction<T, T> {
  const isEqual = key ? (left: T, right: T) => left?.[key] === right?.[key] : (left: T, right: T) => left === right

  return (source) =>
    new Observable<T>((observer) => {
      let lastValue: T
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      const subscription = source.subscribe({
        next(value) {
          if (isEqual(lastValue, value)) {
            clearTimeout(timeoutId)
            timeoutId = setTimeout(() => observer.next(value), dueTime)
          } else {
            clearTimeout(timeoutId)
            observer.next(value)
          }
          lastValue = value
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete()
      })

      return () => {
        clearTimeout(timeoutId)
        subscription.unsubscribe()
      }
    })
}
