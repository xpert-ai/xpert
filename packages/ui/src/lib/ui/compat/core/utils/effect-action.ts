import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Observable, Subject, Subscription, isObservable, of } from 'rxjs'

/**
 * Creates an effect.
 *
 * This effect is subscribed to throughout the lifecycle of the ComponentStore.
 * @param generator A function that takes an origin Observable input and
 *     returns an Observable. The Observable that is returned will be
 *     subscribed to for the life of the component.
 * @return A function that, when called, will trigger the origin Observable.
 */
export function effectAction<
  // This type quickly became part of effect 'API'
  ProvidedType = void,
  // The actual origin$ type, which could be unknown, when not specified
  OriginType extends Observable<ProvidedType> | unknown = Observable<ProvidedType>,
  // Unwrapped actual type of the origin$ Observable, after default was applied
  ObservableType = OriginType extends Observable<infer A> ? A : never,
  // Return either an empty callback or a function requiring specific types as inputs
  ReturnType = ProvidedType | ObservableType extends void
    ? () => void
    : (observableOrValue: ObservableType | Observable<ObservableType>) => Subscription
>(generator: (origin$: OriginType) => Observable<unknown>): ReturnType {
  const _destroyed$ = takeUntilDestroyed()
  const origin$ = new Subject<ObservableType>()
  generator(origin$ as OriginType)
    // tied to the lifecycle 👇 of ComponentStore
    .pipe(_destroyed$)
    .subscribe()

  return ((observableOrValue?: ObservableType | Observable<ObservableType>): Subscription => {
    const observable$ = isObservable(observableOrValue) ? observableOrValue : of(observableOrValue)
    return observable$.pipe(_destroyed$).subscribe((value) => {
      // any new 👇 value is pushed into a stream
      origin$.next(value as any)
    })
  }) as unknown as ReturnType
}
