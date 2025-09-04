import { computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core'
import { EMPTY, Observable, Subscription } from 'rxjs'

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
    // 使用 refreshTrigger 使得 refresh 时也会重新请求
    refreshTrigger()
    return options.request()
  })

  // 自动 effect 监控 requestSig 变化，执行 loader
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
    refreshTrigger()
    return options.request()
  })

  let currentSub: Subscription | null = null

  // 保证资源释放（避免订阅泄漏）
  const destroyRef = inject(DestroyRef)

  effect(
    () => {
      const req = requestSig()
      statusSig.set('loading')
      errorSig.set(null)

      // 取消上一个订阅
      if (currentSub) {
        currentSub.unsubscribe()
      }

      const obs$ = options.loader({ request: untracked(() => req) }) ?? EMPTY

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

  // 注销组件时，清理订阅
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
