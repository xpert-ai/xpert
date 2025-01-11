import { Response } from 'express'
import { Observable, OperatorFunction } from 'rxjs'

export function takeUntilClose<T>(res: Response): OperatorFunction<T, T> {
  return (source: Observable<T>) =>
    new Observable<T>((subscriber) => {
      const subscription = source.subscribe(subscriber)

      const onClose = () => {
        subscriber.complete()
        subscription.unsubscribe()
      }

      res.on('close', onClose)

      return () => {
        res.off('close', onClose)
        subscription.unsubscribe()
      }
    })
}

export function takeUntilAbort<T>(signal: AbortSignal): OperatorFunction<T, T> {
  return (source: Observable<T>) =>
    new Observable<T>((subscriber) => {
      const subscription = source.subscribe(subscriber)

      const onAbort = () => {
        subscriber.complete()
        subscription.unsubscribe()
      }

      if (signal?.aborted) {
        onAbort()
      } else {
        signal?.addEventListener('abort', onAbort)
      }

      return () => {
        signal?.removeEventListener('abort', onAbort)
        subscription.unsubscribe()
      }
    })
}
