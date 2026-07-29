/* eslint-disable @typescript-eslint/member-ordering */
import { HttpClient, HttpParams } from '@angular/common/http'
import { ComponentStore } from '@ngrx/component-store'
import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity'
import { EMPTY, Observable } from 'rxjs'
import { catchError, concatMap, map, shareReplay, switchMap, tap } from 'rxjs/operators'

export interface BaseT {
  id?: string
  name?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface EntityStoreOptions<T extends BaseT, R extends BaseT, State> {
  url: string
  convertResult?: (result: R) => T
  convert?: (input: Partial<T>) => R
  relations?: Array<string>
  initialState?: State
}

export function ComponentEntityStore<T extends BaseT, R extends BaseT = T, State = Record<string, unknown>, U = T>(
  options: EntityStoreOptions<T, R, State>
) {
  type EntitiesState = EntityState<T> & {
    initial: boolean
  } & Partial<State>

  const adapter: EntityAdapter<T> = createEntityAdapter<T>({})
  const initialState = adapter.getInitialState({ initial: true, ...(options.initialState || {}) })
  const { selectAll, selectEntities } = adapter.getSelectors()

  return class EntitiesService extends ComponentStore<EntitiesState> {
    selectAll = selectAll
    selectEntities = selectEntities
    readonly state$ = this.select((state) => {
      if (state.initial) {
        this.refresh()
      }
      return state
    }).pipe(shareReplay())

    all$ = this.state$.pipe(map(selectAll))
    entities$ = this.state$.pipe(map(selectEntities))

    constructor(public httpClient: HttpClient) {
      super(adapter.setAll([], initialState) as EntitiesState)
    }

    readonly upsertOne = this.updater((state, value: T) => {
      return adapter.upsertOne(value, state)
    })
    readonly removeOne = this.updater((state, id: string) => {
      return adapter.removeOne(id, state)
    })

    readonly refresh = this.effect((origin$: Observable<void>) => {
      let params = new HttpParams()
      if (options.relations) {
        const query = JSON.stringify({ relations: options.relations, order: { updatedAt: 'DESC' } })
        params = params.append('$query', query)
      }

      return origin$.pipe(
        switchMap(() => this.httpClient.get<{ items: R[]; total: number }>(options.url, { params })),
        map(({ items }) =>
          items?.map((item) => ({
            ...item,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt)
          }))
        ),
        tap((items: R[]) =>
          this.setAll(items.map(options.convertResult ? options.convertResult : (a: R) => a as unknown as T))
        )
      )
    })

    readonly setAll = this.updater((state, items: T[]) => {
      state.initial = false
      return adapter.setAll(items, state)
    })

    readonly create = this.effect((data$: Observable<Partial<T>>) => {
      return data$.pipe(concatMap((data) => this.createSync(data)))
    })

    createSync(data: Partial<T>) {
      return this.httpClient.post<R>(options.url, options.convert ? options.convert(data) : data).pipe(
        map((entity: R) => {
          return options.convertResult ? options.convertResult(entity) : (entity as unknown as T)
        }),
        // catchError((err) => {
        //   this.message.error(`创建失败：${err.message}`)
        //   return EMPTY
        // }),
        tap((entity: T) => {
          this.upsertOne(entity)
          // 不在通用功能里发出
          // this.message.success(`创建成功：${entity.name || entity.id}`)
        })
      )
    }

    deleteSync(id: string, opts?: { name: string }) {
      return this.httpClient.delete<T>(`${options.url}/${id}`).pipe(
        // catchError((err) => {
        //   this.message.error(`删除失败：${opts?.name || id} ${err.message}`)
        //   return EMPTY
        // }),
        tap(() => {
          this.removeOne(id)
          // this.message.success(`删除成功：${opts?.name || id}`)
        })
      )
    }

    readonly delete = this.effect((id$: Observable<string>) => {
      return id$.pipe(concatMap((id) => this.deleteSync(id)))
    })

    selectOne(id: string) {
      return this.entities$.pipe(map((entities) => entities[id]))
    }

    getOne(id: string): Observable<T> {
      return this.httpClient.get<T>(`${options.url}/${id}`)
    }

    update = this.effect((entity$: Observable<U & { id: string }>) => {
      return entity$.pipe(concatMap((entity) => this.updateSync(entity.id, entity)))
    })

    updateSync(id: string, entity: U & { id?: string; name?: string }) {
      return this.httpClient.put<T>(`${options.url}/${id}`, entity).pipe(
        catchError((err) => {
          // this.message.error(`更新失败：${err.message}`)
          return EMPTY
        }),
        tap(() => {
          this.upsertOne(entity as unknown as T)
          // this.message.success(`更新成功：${entity.name || id}`)
        })
      )
    }

    /**
     * @deprecated 使用 update 方法
     */
    readonly updateEntity = this.effect((entity$: Observable<T>) => {
      return entity$.pipe(
        concatMap((entity) =>
          this.httpClient.put<T>(`${options.url}/${entity.id}`, entity).pipe(
            catchError((err) => {
              // this.message.error(`更新失败：${err.message}`)
              return EMPTY
            }),
            tap(() => {
              this.upsertOne(entity)
              // this.message.success(`更新成功：${entity.name || entity.id}`)
            })
          )
        )
      )
    })
  }
}
