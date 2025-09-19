import { computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core'
import { Observable, Subscription } from 'rxjs'

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error'

interface ResourceOptions<TReq, TRes> {
  request: () => TReq
  loader: (args: { request: TReq }) => Promise<TRes>
}

/**
 * @deprecated Will be replaced by the official `Resource` after upgrading to Angular 19
 */
export function myResource<TReq, TRes>(options: ResourceOptions<TReq, TRes>) {
  const valueSig = signal<TRes | null>(null)
  const errorSig = signal<string | unknown | null>(null)
  const statusSig = signal<ResourceStatus>('idle')
  const refreshTrigger = signal(0)

  const requestSig = computed(() => {
    // Use refreshTrigger to ensure a new request is made on refresh
    refreshTrigger()
    return options.request()
  })

  // Automatic effect monitors requestSig changes and executes loader
  effect(
    () => {
      const requestVal = requestSig()
      statusSig.set('loading')
      errorSig.set(null)
      options
        .loader({ request: untracked(() => requestVal) }) // 避免循环依赖
        .then((res) => {
          valueSig.set(res)
          statusSig.set('success')
        })
        .catch((err) => {
          errorSig.set(err)
          statusSig.set('error')
        })
    },
    { allowSignalWrites: true }
  )

  return {
    value: computed(() => valueSig()),
    error: computed(() => errorSig()),
    status: computed(() => statusSig()),
    reload: () => refreshTrigger.set(refreshTrigger() + 1)
  }
}

interface RxResourceOptions<TReq, TRes> {
  request: () => TReq
  loader: (args: { request: TReq }) => Observable<TRes>
}

/**
 * 
 * @deprecated Will be replaced by the official `Resource` after upgrading to Angular 19
 */
export function myRxResource<TReq, TRes>(options: RxResourceOptions<TReq, TRes>) {
  const valueSig = signal<TRes | null>(null)
  const errorSig = signal<string | null>(null)
  const statusSig = signal<ResourceStatus>('idle')
  const refreshTrigger = signal(0)

  const requestSig = computed(() => {
    return options.request()
  })

  let currentSub: Subscription | null = null

  // Guaranteed resource release (avoiding subscription leaks)
  const destroyRef = inject(DestroyRef)

  effect(
    () => {
      refreshTrigger()
      const req = requestSig()
      errorSig.set(null)

      // Cancel the previous subscription
      if (currentSub) {
        currentSub.unsubscribe()
      }

      const obs$ = options.loader({ request: untracked(() => req) })
      if (!obs$) {
        return
      }

      statusSig.set('loading')
      currentSub = obs$.subscribe({
        next: (res) => {
          valueSig.set(res)
          statusSig.set('success')
        },
        error: (err) => {
          errorSig.set(err)
          statusSig.set('error')
        }
      })
    },
    { allowSignalWrites: true }
  )

  // Guaranteed resource release (avoiding subscription leaks)
  destroyRef.onDestroy(() => {
    if (currentSub) {
      currentSub.unsubscribe()
    }
  })

  return {
    value: computed(() => valueSig()),
    error: computed(() => errorSig()),
    status: computed(() => statusSig()),
    reload: () => refreshTrigger.set(refreshTrigger() + 1)
  }
}
