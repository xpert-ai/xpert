import { CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, ViewChild, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Store } from '@metad/cloud/state'
import { BaseEditorDirective } from '@metad/components/editor'
import { convertQueryResultColumns } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { getErrorMessage } from '@metad/ocap-angular/core'
import { EntitySchemaNode, EntitySchemaType } from '@metad/ocap-angular/entity'
import { NgmMDXEditorComponent } from '@metad/ocap-angular/mdx'
import { NgmSQLEditorComponent } from '@metad/ocap-angular/sql'
import { QueryReturn, measureFormatter, nonNullable, serializeUniqueName } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { isPlainObject } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { connect } from 'ngxtension/connect'
import { BehaviorSubject, Subscription, firstValueFrom, of } from 'rxjs'
import { catchError, finalize, map, tap } from 'rxjs/operators'
import { injectQueryCommand } from '../../copilot'
import { ModelComponent } from '../../model.component'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, MODEL_TYPE } from '../../types'
import { serializePropertyUniqueName } from '../../utils'
import { ModelEntityService } from '../entity.service'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-entity-query',
  templateUrl: 'query.component.html',
  styleUrls: ['query.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MaterialModule,
    NgmCommonModule,
    NgmMDXEditorComponent,
    NgmSQLEditorComponent
  ]
})
export class EntityQueryComponent extends TranslationBaseComponent {
  MODEL_TYPE = MODEL_TYPE

  readonly modelService = inject(SemanticModelService)
  readonly modelComponent = inject(ModelComponent)
  readonly entityService = inject(ModelEntityService)
  readonly store = inject(Store)
  readonly #logger = inject(NGXLogger)

  @ViewChild('editor') editor!: BaseEditorDirective

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly themeName = toSignal(this.store.preferredTheme$.pipe(map((theme) => theme?.split('-')[0])))
  readonly entityType = this.entityService.entityType
  readonly tables = toSignal(this.modelService.selectDBTables())
  readonly statement = signal<string>(null)

  entities = []

  readonly textSelection = signal<{ range: any; text: string }>(null)

  // 当前使用 MDX 查询
  public readonly useMDX = toSignal(
    this.modelService.modelType$.pipe(
      map((modelType) => modelType === MODEL_TYPE.XMLA || modelType === MODEL_TYPE.OLAP)
    )
  )
  public readonly modelType$ = this.modelService.modelType$

  // for results table
  public readonly loading$ = new BehaviorSubject<boolean>(null)
  columns: any[]
  data: any[]

  readonly _error = signal('')
  readonly querySubscription = signal<Subscription>(null)

  readonly showQueryResult = signal(false)

  readonly dialect = this.modelService.dialect
  readonly queryContext = computed(() => {
    return {
      dialect: this.dialect(),
      isMDX: this.useMDX(),
      entityTypes: [this.entityType()]
    }
  })

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #queryCommand = injectQueryCommand(this.statement, this.queryContext, async (query: string) => {
    this._error.set(null)
    this.loading$.next(true)
    return await firstValueFrom(this._query(query))
  })

  constructor() {
    super()

    connect(this.statement, this.entityService.statement$)
    effect(
      () => {
        if (nonNullable(this.statement())) {
          this.entityService.statement = this.statement()
        }
      },
      { allowSignalWrites: true }
    )
  }

  executeQuery(statement: string) {
    this._error.set(null)
    if (statement) {
      this.loading$.next(true)
    } else {
      this.loading$.next(false)
    }

    this.querySubscription()?.unsubscribe()
    if (statement) {
      const subscription = this._query(statement).subscribe()
      this.querySubscription.set(subscription)
    } else {
      this.querySubscription.set(null)
    }
  }

  _query(statement: string) {
    // Show query result or progress status
    this.showQueryResult.set(true)

    // Query data
    return this.modelService.dataSource$.value.query({ statement, forceRefresh: true }).pipe(
      catchError((error) => {
        console.error(error)
        return of({
          error: getErrorMessage(error)
        })
      }),
      tap(({ status, error, schema, data }: QueryReturn<unknown>) => {
        if (error) {
          console.error(error)
          this._error.set(error)
          // this._cdr.detectChanges()
          return
        }

        const columns = convertQueryResultColumns(schema)

        if (isPlainObject(data)) {
          columns.push(...typeOfObj(data))
          data = [data]
        }

        this.data = data
        this.columns = columns

        console.group(`sql results`)
        console.debug(`statement`, statement)
        console.debug(`data`, data)
        console.debug(`columns`, columns)
        console.groupEnd()
      }),
      finalize(() => {
        this.loading$.next(false)
        // this._cdr.detectChanges()
      })
    )
  }

  run() {
    const statement: string = this.editor.getSelectText()?.trim() || this.statement()
    this.executeQuery(statement)
  }

  cancelQuery() {
    this.executeQuery('')
  }

  async onEditorKeyDown(event) {
    if (event.code === 'F8') {
      this.run()
    }
  }

  onSelectionChange(event: { range: any; text: string }) {
    this.textSelection.set(event)
  }

  onStatementChange(event: string) {
    this.entityService.statement = event
  }

  /**
   * 另存为 SQL Model
   */
  saveAsModel() {
    this.modelComponent.createByExpression(this.statement())
  }

  async drop(event: CdkDragDrop<{ name: string }[]>) {
    const modelType = await firstValueFrom(this.modelType$)
    const dialect = this.dialect()
    const property = event.item.data
    if (event.previousContainer.id === 'list-measures') {
      this.editor.insert(modelType === MODEL_TYPE.XMLA ? property.name : measureFormatter(property.name))
    } else if (event.previousContainer.id === 'list-dimensions') {
      this.editor.insert(modelType === MODEL_TYPE.XMLA ? property.name : serializePropertyUniqueName(property, dialect))
    } else if (event.previousContainer.id === CdkDragDropContainers.Entities) {
      this.editor.insert(modelType === MODEL_TYPE.XMLA ? property.name : serializeUniqueName(property.name))
    } else {
      console.log(event.previousContainer.id)
    }
  }

  dropTable(event: CdkDragDrop<{ name: string }[]>) {
    const text = event.item.data?.name
    if (text) {
      this.executeQuery(`SELECT * FROM ${text}`)
    }
  }

  entityDeletePredicate(item: CdkDrag<EntitySchemaNode>) {
    return item.data.type === EntitySchemaType.Entity
  }

  triggerFormat() {
    this.editor.formatDocument()
  }

  triggerCompress() {
    this.editor.compressDocument()
  }

  triggerClear() {
    this.editor.clearDocument()
  }

  triggerFind() {
    this.editor.startFindAction()
  }
}

/**
 * 根据 SQL 查询结果对象分析出字段类型
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
 *
 * @param obj
 * @returns
 */
export function typeOfObj(obj) {
  return Object.entries(obj).map(([key, value]) => ({
    name: key,
    type: value === null || value === undefined ? null : typeof value
  }))
}
