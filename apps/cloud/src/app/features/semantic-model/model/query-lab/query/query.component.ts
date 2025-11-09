import { CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  TemplateRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { CopilotChatMessageRoleEnum, CopilotEngine, nanoid } from '@metad/copilot'
import { NgmCopilotService, provideCopilotDropAction } from '@metad/copilot-angular'
import { calcEntityTypePrompt, convertQueryResultColumns, getErrorMessage } from '@metad/core'
import { EntityCapacity, EntitySchemaNode, EntitySchemaType } from '@metad/ocap-angular/entity'
import { NgmBaseEditorDirective } from '@metad/ocap-angular/formula'
import { C_MEASURES, VariableProperty, measureFormatter, nonNullable, wrapBrackets } from '@metad/ocap-core'
import { limitSelect, serializeName } from '@metad/ocap-sql'
import { TranslateService } from '@ngx-translate/core'
import { injectToastr, ModelQuery, Store } from 'apps/cloud/src/app/@core'
import { isEqual, isPlainObject, uniqBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Subscription, combineLatest, firstValueFrom, of } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators'
import { FeaturesComponent } from '../../../../features.component'
import { injectQueryCommand } from '../../copilot'
import { ModelComponent } from '../../model.component'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, MODEL_TYPE, QueryResult, SemanticModelEntityType } from '../../types'
import { markdownTableData, quoteLiteral, stringifyTableType } from '../../utils'
import { QueryLabService } from '../query-lab.service'
import { QueryCopilotEngineService } from './copilot.service'
import { QueryService } from './query.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-query',
  templateUrl: 'query.component.html',
  styleUrls: ['query.component.scss'],
  providers: [QueryService, QueryCopilotEngineService]
})
export class QueryComponent {
  MODEL_TYPE = MODEL_TYPE
  EntityCapacity = EntityCapacity

  readonly #queryService = inject(QueryService)
  private readonly modelComponent = inject(ModelComponent)
  public readonly modelService = inject(SemanticModelService)
  public readonly queryLabService = inject(QueryLabService)
  readonly copilotService = inject(NgmCopilotService)
  private readonly _cdr = inject(ChangeDetectorRef)
  private readonly route = inject(ActivatedRoute)
  private readonly store = inject(Store)
  readonly #logger = inject(NGXLogger)
  readonly featuresComponent = inject(FeaturesComponent)
  readonly #destroyRef = inject(DestroyRef)
  readonly translateService = inject(TranslateService)
  readonly #toastr = injectToastr()

  @ViewChild('editor') editor!: NgmBaseEditorDirective
  readonly tableTemplate = viewChild<TemplateRef<any>>('tableTemplate')

  themeName = toSignal(this.store.preferredTheme$.pipe(map((theme) => theme?.split('-')[0])))

  get dbInitialization() {
    return this.modelService.modelSignal()?.dbInitialization
  }

  textSelection: {
    range: {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
      selectionStartLineNumber: number
    }
    text: string
  }
  get selectedStatement() {
    return this.textSelection?.text || this.statement
  }

  // Copilot
  prompt = new FormControl<string>(null)
  answering = signal(false)
  // private entityTypes: EntityType[]
  /**
   * @deprecated tranform to copilot command
   */
  private get promptTables() {
    return this.entityTypes()?.map((entityType) => {
      return `${this.isMDX() ? 'Cube' : 'Table'} name: "${entityType.name}",
caption: "${entityType.caption}",
${this.isMDX() ? 'dimensions and measures' : 'columns'} : [${Object.keys(entityType.properties)
        .map(
          (key) =>
            `${serializeName(key, entityType.dialect)} ${entityType.properties[key].dataType}` +
            (entityType.properties[key].caption ? ` ${entityType.properties[key].caption}` : '')
        )
        .join(', ')}]`
    })
  }
  /**
   * @deprecated tranform to copilot command
   */
  get #promptCubes() {
    return this.entityTypes()?.map((entityType) => {
      return `Cube name: [${entityType.name}],
Cube info is:
\`\`\`json
${calcEntityTypePrompt(entityType)}
\`\`\`
`
    })
  }

  readonly copilotContext = computed(() => {
    return {
      dialect: this.entityTypes()[0]?.dialect,
      isMDX: this.isMDX(),
      entityTypes: this.entityTypes()
    }
  })

  public readonly queryId$ = this.route.paramMap.pipe(
    startWith(this.route.snapshot.paramMap),
    map((paramMap) => paramMap.get('id')),
    filter((value) => !!value),
    map(decodeURIComponent),
    distinctUntilChanged()
  )

  public readonly queryState$ = this.queryId$.pipe(
    switchMap((id) => this.queryLabService.selectQuery(id)),
    filter((value) => !!value),
    shareReplay(1)
  )
  public readonly query$ = this.queryState$.pipe(
    map((state) => state.query),
    shareReplay<ModelQuery>(1)
  )
  public readonly results$ = this.queryState$.pipe(
    map((state) => state.results),
    shareReplay(1)
  )

  readonly statementSignal = toSignal(this.query$.pipe(map((query) => query.statement)))
  readonly _statement = signal('')
  get statement() {
    return this._statement()
  }
  set statement(value) {
    this.onStatementChange(value)
  }

  public readonly tables$ = this.modelService.selectDBTables()
  public readonly conversations$ = this.query$.pipe(map((query) => query.conversations))

  // for results table
  public readonly loading$ = new BehaviorSubject<boolean>(false)
  // error: string

  readonly _error = signal('')
  readonly querySubscription = signal<Subscription>(null)

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  // Currently using MDX query
  readonly modelType = toSignal(this.modelService.modelType$)
  /**
   * The source is Xmla service, so must use MDX statement to query
   */
  readonly isMDX = computed(() => this.modelType() === MODEL_TYPE.XMLA)
  readonly useSaveAsSQL = computed(() => this.modelType() === MODEL_TYPE.SQL)
  readonly isWasm = toSignal(this.modelService.isWasm$)
  readonly entities = toSignal(this.query$.pipe(map((query) => query.entities ?? [])))
  readonly entityTypes = toSignal(
    this.query$.pipe(
      map((query) => query.entities ?? []),
      switchMap((entities) =>
        combineLatest(entities.map((entity) => this.modelService.selectOriginalEntityType(entity)))
      )
    ),
    { initialValue: [] }
  )
  readonly queryKey = toSignal(this.queryId$)
  readonly queryType = toSignal(this.query$.pipe(map((query) => query.type)))

  readonly dataSourceName = computed(() => 
    this.queryType() === 'mdx' ? this.modelService.dataSource()?.options.key :
      this.modelService.origiDataSource()?.options.key)
  readonly entityType = computed(() => this.entityTypes()[0])

  readonly navDropPredicate = computed(() => {
    const isMDX = this.isMDX()
    return (event: CdkDrag<EntitySchemaNode>) => {
      if (isMDX) {
        return [CdkDragDropContainers.Tables, CdkDragDropContainers.Entity].includes(
          event.dropContainer.id as CdkDragDropContainers
        )
      } else {
        return [CdkDragDropContainers.Tables, CdkDragDropContainers.Entity].includes(
          event.dropContainer.id as CdkDragDropContainers
        )
      }
    }
  })

  sqlEditorActionLabel = toSignal(
    this.translateService.stream('PAC.MODEL.QUERY.EditorActions', {
      Default: {
        Nl2SQL: 'NL 2 SQL',
        Explain: 'Explain',
        Optimize: 'Optimize'
      }
    })
  )

  get results() {
    return this.queryLabService.results[this.queryKey()]
  }
  set results(value) {
    this.queryLabService.results[this.queryKey()] = value
  }
  get activeResult() {
    return this.queryLabService.activeResults[this.queryKey()]
  }
  set activeResult(value) {
    this.queryLabService.activeResults[this.queryKey()] = value
  }
  get dirty() {
    return this.queryLabService.dirty[this.queryKey()]
  }
  set dirty(value) {
    this.queryLabService.dirty[this.queryKey()] = value
  }

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #queryCommand = injectQueryCommand(this._statement, this.copilotContext, async (statement: string) => {
    return await firstValueFrom(this._query(statement))
  })

  #entityDropAction = provideCopilotDropAction({
    id: CdkDragDropContainers.QueryEntity,
    implementation: async (event: CdkDragDrop<any[], any[], any>, copilotEngine: CopilotEngine) => {
      this.#logger.debug(`Drop table entity to copilot chat:`, event)
      const data = event.item.data
      // Get the source table or source cube structure
      const entityType = await firstValueFrom(this.modelService.selectOriginalEntityType(data.name))

      const topCount = 10
      const samples = await firstValueFrom(this.modelService.selectTableSamples(data.name, topCount))

      const tableHeader = `The structure of table "${data.name}" is as follows:`
      const dataHeader = `The first ${topCount} rows of the table "${data.name}" are as follows:`

      return [
        {
          id: nanoid(),
          role: CopilotChatMessageRoleEnum.User,
          data: {
            columns: [
              { name: 'name', caption: 'Name' },
              { name: 'caption', caption: 'Description' },
              { name: 'dataType', caption: 'Type' }
            ],
            content: Object.values(entityType.properties) as any[],
            header: tableHeader
          },
          content: tableHeader + '\n' + stringifyTableType(entityType),
          templateRef: this.tableTemplate()
        },
        {
          id: nanoid(),
          role: CopilotChatMessageRoleEnum.User,
          data: {
            columns: samples.columns,
            content: samples.data,
            header: dataHeader
          },
          content: dataHeader + '\n' + markdownTableData(samples),
          templateRef: this.tableTemplate()
        }
      ]
    }
  })

  /**
  |--------------------------------------------------------------------------
  | Subscribers
  |--------------------------------------------------------------------------
  */
  private dirtySub = this.queryState$.pipe(takeUntilDestroyed()).subscribe((state) => {
    this.dirty = !isEqual(state.origin, state.query)
  })
  #conversationSub = this.#queryService
    .select((state) => state.query?.conversations ?? [])
    .pipe(takeUntilDestroyed())
    .subscribe((conversations) => {
      // this.#copilotEngine.conversations$.set(cloneDeep(conversations))
    })

  constructor() {
    effect(
      () => {
        if (this.#queryService.initialized()) {
          // if (!isEqual(this.#queryService.conversations(), this.#copilotEngine.conversations())) {
          //   this.#queryService.setConversations(this.#copilotEngine.conversations())
          // }
        }
      },
      { allowSignalWrites: true }
    )

    // Set individual engine to global copilot chat
    // this.featuresComponent.copilotEngine = this.#copilotEngine
    this.#destroyRef.onDestroy(() => {
      this.featuresComponent.copilotEngine = null
    })

    // Sync statement in local and store
    effect(
      () => {
        if (nonNullable(this.statementSignal())) {
          this._statement.set(this.statementSignal())
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (nonNullable(this._statement())) {
          this.queryLabService.setStatement({ key: this.queryKey(), statement: this._statement() })
        }
      },
      { allowSignalWrites: true }
    )
  }

  onSelectionChange(event) {
    this.textSelection = event
  }

  editorDropPredicate(event: CdkDrag<EntitySchemaNode>) {
    // Exclude dragging query results
    return !['pac-model__query-results'].includes(event.dropContainer.id)
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
      let subscription = null
      if (this.queryType() === 'mdx') {
        subscription = this.queryMDX(statement).subscribe()
      } else {
        subscription = this._query(statement).subscribe()
      }
      this.querySubscription.set(subscription)
    } else {
      this.querySubscription.set(null)
    }
  }

  queryMDX(statement: string) {
    return this.modelService.dataSource().query({ statement, forceRefresh: true }).pipe(
      tap((result) => {
        const { status, error, schema } = result
        let { data } = result

        if (status === 'ERROR' || error) {
          // console.error(error)
          this._error.set(error || status)

          this.appendResult({
            statement,
            error
          })

          this._cdr.detectChanges()
          return
        }

        try {
          const columns = convertQueryResultColumns(schema)

          if (isPlainObject(data)) {
            columns.push(...typeOfObj(data))
            data = [data]
          }

          let preview = data
          if (data?.length > 1000) {
            preview = data.slice(0, 1000)
          }

          this.appendResult({
              statement,
              data,
              preview,
              columns
            })
          this.loading$.next(false)
          console.group(`sql results`)
          console.debug(`statement`, statement)
          console.debug(`data`, data)
          console.debug(`columns`, columns)
          console.groupEnd()
        } catch (err) {
          console.error(err)
        }
      }),
      catchError((error) => {
        this._error.set(getErrorMessage(error))
        this.appendResult({
          statement,
          error
        })
        this.loading$.next(false)
        return of({
          error: error
        })
      })
    )
  }

  _query(statement: string) {
    return this.modelService.origiDataSource().query({ statement, forceRefresh: true }).pipe(
      tap((result) => {
        const { status, error, schema } = result
        let { data } = result

        if (status === 'ERROR' || error) {
          // console.error(error)
          this._error.set(error || status)

          this.appendResult({
            statement,
            error
          })

          this._cdr.detectChanges()
          return
        }

        try {
          const columns = convertQueryResultColumns(schema)

          if (isPlainObject(data)) {
            data = [data]
          }
          if (columns.length === 0 && data?.length > 0) {
            columns.push(...typeOfObj(data[0]))
          }

          let preview = data
          if (data?.length > 1000) {
            preview = data.slice(0, 1000)
          }

          this.appendResult({
            statement,
            data,
            columns: uniqBy(columns, 'name'),
            preview,
            stats: {
              numberOfEntries: data?.length ?? 0
            }
          })

          this.loading$.next(false)
        } catch (err) {
          console.error(err)
        }
      }),
      catchError((error) => {
        this._error.set(getErrorMessage(error))
        this.appendResult({
          statement,
          error
        })
        this.loading$.next(false)
        return of({
          error: error
        })
      })
    )
  }

  cancelQuery() {
    this.executeQuery('')
  }

  appendResult(result: QueryResult) {
    this.results = this.results ?? []
    this.results.push(result)
    this.activeResult = this.results[this.results.length - 1]
  }

  async run() {
    const statement: string = this.editor.getSelectText()?.trim() || this.statement
    this.executeQuery(statement)
  }

  async onEditorKeyDown(event) {
    if (event.code === 'F8') {
      await this.run()
    }
  }

  onStatementChange(event: string) {
    if (this.queryKey() && nonNullable(event)) {
      this.queryLabService.setStatement({ key: this.queryKey(), statement: event })
    }
  }

  /**
   * save as SQL Model
   */
  saveAsModel() {
    this.modelComponent.createByExpression(this.statement)
  }

  async saveAsDBScript() {
    const statement: string = this.editor.getSelectText()?.trim() || this.statement
    this.modelService.updateDraft({ dbInitialization: statement })
  }

  dropEntity(event: CdkDragDrop<{ name: string }[]>) {
    try {
      if (event.container === event.previousContainer) {
        this.queryLabService.moveEntityInQuery({ key: this.queryKey(), event })
      } else {
        switch (event.previousContainer.id) {
          case CdkDragDropContainers.Tables: {
            if (event.item.data?.name) {
              this.queryLabService.initType(this.queryKey(), 'sql')
              this.queryLabService.addEntity({
                key: this.queryKey(),
                entity: event.item.data?.name,
                currentIndex: event.currentIndex
              })
            }
            break
          }
          case CdkDragDropContainers.Entity: {
            if (this.isMDX()) {
              this.queryLabService.initType(this.queryKey(), 'mdx')
              // Add original cube name into list
              this.queryLabService.addEntity({
                key: this.queryKey(),
                entity: event.item.data?.cube?.name,
                currentIndex: event.currentIndex
              })
            } else {
              if (event.item.data?.type === SemanticModelEntityType.CUBE) {
                this.queryLabService.initType(this.queryKey(), 'mdx')
                this.queryLabService.addEntity({
                  key: this.queryKey(),
                  entity: event.item.data?.name,
                  currentIndex: event.currentIndex
                })
              } else if (event.item.data?.cubeUsages) { // @todo use type check
                this.queryLabService.initType(this.queryKey(), 'mdx')
                this.queryLabService.addEntity({
                  key: this.queryKey(),
                  entity: event.item.data?.name,
                  currentIndex: event.currentIndex
                })
              }
            }
            break
          }
        }
      }
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
    }
  }

  drop(event: CdkDragDrop<{ name: string }[]>) {
    const data = event.item.data
    if (!data) {
      return
    }
    let text = data.name
    switch ((<EntitySchemaNode>data).type) {
      case EntitySchemaType.Parameter:
        text = serializeVariable(data)
        break
      case EntitySchemaType.Parameters:
        // Currently only supports SAP Variables
        text = `SAP VARIABLES\n` + (data.members?.map(serializeVariable).join('\n') ?? '')
        break
      case EntitySchemaType.IMeasure:
        text = measureFormatter(data.name)
        break
    }

    if (text) {
      this.editor.insert(text)
    }
  }

  /**
   * Drop in query results
   *
   * @param event
   */
  async dropTable(event: CdkDragDrop<{ name: string }[]>) {
    const modelType = this.modelService.modelType()
    const dialect = this.modelService.dialect()

    let statement = ''
    if (modelType === MODEL_TYPE.XMLA || this.queryType() === 'mdx') {
      statement = await this.getXmlaQueryStatement(event.item.data)
    } else {
      if (event.item.data) {
        if (event.item.data.type === EntitySchemaType.Member) {
          statement = `SELECT * FROM ${serializeName(event.item.data.entity, dialect)} WHERE ${serializeName(
            event.item.data.dimension,
            dialect
          )} = ${quoteLiteral(event.item.data.memberKey)}`
        } else if (event.item.data.type === EntitySchemaType.Dimension) {
          statement = `SELECT DISTINCT ${serializeName(event.item.data.column, dialect)} FROM ${serializeName(
            event.item.data.entity,
            dialect
          )}`
        } else if (event.item.data.type === EntitySchemaType.IMeasure) {
          statement = `SELECT SUM(${serializeName(event.item.data.name, dialect)}), AVG(${serializeName(
            event.item.data.name,
            dialect
          )}), MAX(${serializeName(event.item.data.name, dialect)}), MIN(${serializeName(
            event.item.data.name,
            dialect
          )}) FROM ${serializeName(event.item.data.entity, dialect)}`
        } else {
          statement = limitSelect(serializeName(event.item.data.name, dialect), 1000, dialect)
        }
      }
    }

    if (statement) {
      this.executeQuery(statement)
    }
  }

  async getXmlaQueryStatement(data: any) {
    if (data.cubeType === 'CUBE' || data.cubeType === 'QUERY CUBE') {
      return `SELECT {[Measures].Members} ON COLUMNS FROM [${data.name}]`
    } else {
      switch ((<EntitySchemaNode>data).type) {
        case EntitySchemaType.Entity:
          return `SELECT {[Measures].Members} ON COLUMNS FROM [${data.name}]`
        case EntitySchemaType.Dimension:
          if (data.name === wrapBrackets(C_MEASURES)) {
            return `SELECT {[Measures].Members} ON COLUMNS FROM [${data.entity}]`
          }
          return `SELECT {[Measures].Members} ON COLUMNS, {${data.name}.Members} ON ROWS FROM [${data.entity}]`
        case EntitySchemaType.Hierarchy:
        case EntitySchemaType.Level:
          return `SELECT {[Measures].Members} ON COLUMNS, {${data.name}.${data.allMember || 'Members'}} ON ROWS FROM [${
            data.cubeName
          }]`
        case EntitySchemaType.Member:
          return `SELECT {[Measures].Members} ON COLUMNS, {${data.raw.memberUniqueName}} ON ROWS FROM [${data.raw.cubeName}]`
        case EntitySchemaType.Field:
          return `SELECT {[Measures].Members} ON COLUMNS, {${data.levelUniqueName}.Members} DIMENSION PROPERTIES ${data.name} ON ROWS FROM [${data.cubeName}]`
        case EntitySchemaType.IMeasure:
          return `SELECT {${data.name}} ON COLUMNS FROM [${data.entity}]`
        // case EntitySchemaType.Parameter:
        //   return `${data.name} INCLUDING ` + (data.defaultLow ? `${data.hierarchy}.${data.defaultLow}` : '')
        //     + (data.defaultHigh ? `:${data.hierarchy}.${data.defaultHigh}` : '')
      }
    }

    return ``
  }

  entityDeletePredicate(item: CdkDrag<EntitySchemaNode>) {
    return item.data?.type === EntitySchemaType.Entity
  }

  deleteEntity(event: CdkDragDrop<{ name: string }[]>) {
    this.queryLabService.removeEntity({ key: this.queryKey(), entity: event.item.data.name })
  }

  deleteResult(i: number) {
    let index = this.results.indexOf(this.activeResult)
    this.results.splice(i, 1)
    if (index >= i) {
      index--
    }
    if (index === -1) {
      index = 0
    }
    this.activeResult = this.results[index]
  }

  closeAllResults() {
    this.results = []
    this.activeResult = null
  }

  save() {
    this.queryLabService.save(this.queryKey())
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

  triggerUndo() {
    this.editor.undo()
  }

  triggerRedo() {
    this.editor.redo()
  }

  onConversationsChange(event) {
    this.queryLabService.setConversations({ key: this.queryKey(), conversations: event })
  }

  onCopilotCopy(text: string) {
    this.editor.appendText(text)
  }

  export() {
    this._export('QueryLabResult', this.activeResult.data, this.activeResult.columns)
  }

  async _export(name: string, data: any[], COLUMNS) {
    const xlsx = await import('xlsx')

    const hNameRow = {}
    const headerRow = {}
    COLUMNS.forEach(({ name, label }) => {
      hNameRow[name] = name
      headerRow[name] = label || name
    })

    data = data.map((item) => {
      const row = {}
      COLUMNS.forEach((col) => {
        row[col.name] = item[col.name]
      })
      return row
    })

    /* generate worksheet */
    const ws /**: xlsx.WorkSheet */ = xlsx.utils.json_to_sheet([headerRow, ...data], {
      header: COLUMNS.map(({ name }) => name),
      skipHeader: true
    })

    /* generate workbook and add the worksheet */
    const wb /**: XLSX.WorkBook */ = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1')

    let fileName = `${name}.xlsx`
    /* save to file */
    xlsx.writeFile(wb, fileName)
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'F8') {
      this.run()
      event.preventDefault()
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 's' || event.key === 'S')) {
      this.saveAsModel()
      event.preventDefault()
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
      this.save()
      event.preventDefault()
    }
  }
}

/**
 * Analyze the field type based on the SQL query result object
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

function serializeVariable(data: VariableProperty) {
  return (
    `${data.name} INCLUDING ` +
    (data.defaultLow ? `${data.referenceHierarchy}.${data.defaultLow}` : `${data.referenceHierarchy}.[]`) +
    (data.defaultHigh ? `:${data.referenceHierarchy}.${data.defaultHigh}` : '')
  )
}
