import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, inject, signal } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { CopilotChatConversation } from '@metad/copilot'
import { NgmConfirmUniqueComponent } from '@metad/ocap-angular/common'
import { cloneDeep, isEqual } from '@metad/ocap-core'
import { ComponentStore } from '@metad/store'
import { ModelQuery, ModelQueryService, convertModelQueryResult, injectTranslate, uuid } from 'apps/cloud/src/app/@core'
import { firstValueFrom } from 'rxjs'
import { ModelQueryState, QueryResult } from '../types'
import { initModelQueryState } from './types'
import { injectI18nService } from '@cloud/app/@shared/i18n'

export interface QueryLabState {
  modelId: string
  queries: {
    [key: string]: ModelQueryState
  }
}

@Injectable()
export class QueryLabService extends ComponentStore<QueryLabState> {
  private readonly modelQueryService = inject(ModelQueryService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  public readonly dialog = inject(MatDialog)
  readonly translate = injectI18nService()

  public results: {
    [key: string]: QueryResult[]
  } = {}
  public activeResults: {
    [key: string]: QueryResult
  } = {}
  public dirty = {}

  get isDirty() {
    return Object.values(this.dirty).some((value) => value)
  }

  readonly currentQuery = signal<string>(null)

  public readonly queries$ = this.select((state) =>
    Object.values(state.queries)
      .filter(Boolean)
      .map(({ query }) => query)
  )

  constructor() {
    super({ queries: {} } as QueryLabState)
  }

  selectQuery(key: string) {
    this.currentQuery.set(key)
    return this.select((state) => state.queries[key])
  }

  readonly init = this.updater((state, { modelId, queries }: { modelId: string; queries: ModelQueryState[] }) => {
    state.queries = {}
    state.modelId = modelId
    queries?.forEach((query) => {
      state.queries[query.key] = query
    })

    if (!queries?.length) {
      const key = this.newQuery('')
      this.router.navigate(['.', key], { relativeTo: this.route })
    } else {
      const queries = Object.values(state.queries)
      const lastKey = queries[queries.length - 1].query.key
      this.router.navigate(['.', lastKey], { relativeTo: this.route })
    }
  })

  readonly checkDirty = this.updater((state) => {
    Object.keys(state.queries).forEach((key) => {
      state.queries[key].dirty = !isEqual(state.queries[key].origin, state.queries[key].query)
    })
  })

  readonly updateQuery = this.updater((state, { key, query }: { key: string; query: Partial<ModelQuery> }) => {
    if (state.queries[key]) {
      state.queries[key].query = {
        ...state.queries[key].query,
        ...query
      }
    }
  })

  initType(key: string, type: 'sql' | 'mdx') {
    const query = this.get((state) => state.queries[key].query)
    if (query.type && query.type !== type) {
      throw new Error(
        this.translate.instant('PAC.MODEL.QUERY.QueryTypeInitialized', {Default: 'Query type has been initialized'})
      )
    }
    this.updateQuery({ key, query: { type } })
  }

  newQuery(statement?: string) {
    const key = uuid()
    this.updater((state) => {
      state.queries[key] = initModelQueryState(state.modelId, key, statement)
    })()

    return key
  }

  readonly removeQuery = this.updater((state, key: string) => {
    state.queries[key] = null
  })

  async deleteQuery(key: string) {
    const queries = this.get((state) => state.queries)
    const query = queries[key]?.query
    if (query?.id) {
      await firstValueFrom(this.modelQueryService.delete(query.id))
    }
    this.removeQuery(key)
  }

  readonly addEntity = this.updater(
    (state, { key, entity, currentIndex }: { key?: string; entity: string; currentIndex?: number }) => {
      key ??= this.currentQuery()
      const query = state.queries[key].query
      query.entities = query.entities ?? []
      if (entity && query.entities.indexOf(entity) === -1) {
        query.entities.splice(currentIndex ?? query.entities.length, 0, entity)
      }
    }
  )
  readonly removeEntity = this.updater((state, { key, entity }: { key: string; entity: string }) => {
    const query = state.queries[key].query
    const index = query?.entities?.indexOf(entity)
    if (index > -1) {
      query.entities.splice(index, 1)
    }
  })

  readonly moveEntityInQuery = this.updater(
    (state, { event, key }: { event: CdkDragDrop<{ name: string }[]>; key: string }) => {
      const query = state.queries[key].query
      moveItemInArray(query.entities, event.previousIndex, event.currentIndex)
    }
  )

  readonly setStatement = this.updater((state, { key, statement }: { key: string; statement: string }) => {
    if (state.queries[key]) {
      const query = state.queries[key].query
      query.statement = statement
    }
  })

  readonly addResult = this.updater((state, { key, result }: { key: string; result: QueryResult }) => {
    const query = state.queries[key]
    query.results.push(result)
  })

  readonly setConversations = this.updater(
    (state, { key, conversations }: { key: string; conversations: Array<CopilotChatConversation> }) => {
      const query = state.queries[key].query
      query.conversations = conversations
    }
  )

  async renameQuery(key: string) {
    const queries = this.get((state) => state.queries)
    const query = queries[key]?.query
    const result = await firstValueFrom(this.dialog.open(NgmConfirmUniqueComponent, { data: query.name }).afterClosed())
    if (result) {
      this.updater((state, name: string) => {
        state.queries[key].query.name = name
      })(result)
    }
  }

  readonly setQuery = this.updater((state, { key, query }: { key: string; query: ModelQuery }) => {
    state.queries[key].origin = cloneDeep(query)
    state.queries[key].query = cloneDeep(query)
  })

  readonly updateOrders = this.updater((state, orders: { key: string; index: number }[]) => {
    orders.forEach(({ key, index }) => {
      state.queries[key].query.index = index
    })
    this.checkDirty()
  })

  async save(key: string) {
    const queries = this.get((state) => state.queries)
    let query = queries[key].query
    if (query.id) {
      const result = await firstValueFrom(this.modelQueryService.update(query.id, query))
      this.setQuery({ key, query })
    } else {
      const result = await firstValueFrom(this.modelQueryService.create(query))
      query = convertModelQueryResult(result)
      this.setQuery({ key, query })
    }
  }
}
