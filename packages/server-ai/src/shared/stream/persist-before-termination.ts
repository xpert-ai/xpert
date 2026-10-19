import { concatMap, defer, dematerialize, materialize, of, type MonoTypeOperatorFunction } from 'rxjs'

/** RxJS finalize does not await promises. Hold completion/error until the durable final write finishes. */
export function persistBeforeTermination<T>(persist: () => Promise<void>): MonoTypeOperatorFunction<T> {
    return (source) =>
        source.pipe(
            materialize(),
            concatMap((notification) =>
                notification.kind === 'N'
                    ? of(notification)
                    : defer(async () => {
                          await persist()
                          return notification
                      })
            ),
            dematerialize()
        )
}
