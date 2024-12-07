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
import { BaseEditorDirective } from '@metad/components/editor'
import { calcEntityTypePrompt, convertQueryResultColumns, getErrorMessage } from '@metad/core'
import { CopilotChatMessageRoleEnum, CopilotEngine, nanoid } from '@metad/copilot'
import { NgmCopilotService, provideCopilotDropAction } from '@metad/copilot-angular'
import { EntityCapacity, EntitySchemaNode, EntitySchemaType } from '@metad/ocap-angular/entity'
import { C_MEASURES, Cube, EntityType, nonNullable, PropertyAttributes, uniqBy, VariableProperty, wrapBrackets } from '@metad/ocap-core'
import { serializeName } from '@metad/ocap-sql'
import { ModelQuery, Store } from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language/translation-base.component'
import { cloneDeep, isEqual, isPlainObject } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Subscription, combineLatest, firstValueFrom, of } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators'
import { FeaturesComponent } from '../../../../features.component'
import { ModelComponent } from '../../model.component'
import { SemanticModelService } from '../../model.service'
import { CdkDragDropContainers, MODEL_TYPE, QueryResult } from '../../types'
import { markdownTableData, quoteLiteral, stringifyTableType } from '../../utils'
import { QueryLabService } from '../query-lab.service'
import { QueryService } from './query.service'
import { QueryCopilotEngineService } from './copilot.service'
import { injectQueryCommand } from '../../copilot'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-query',
  templateUrl: 'query.component.html',
  styleUrls: ['query.component.scss'],
  providers: [QueryService, QueryCopilotEngineService]
})
export class QueryComponent extends TranslationBaseComponent {
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

  @ViewChild('editor') editor!: BaseEditorDirective
  readonly tableTemplate = viewChild<TemplateRef<any>>('tableTemplate')

  themeName = toSignal(this.store.preferredTheme$.pipe(map((theme) => theme?.split('-')[0])))

  get dataSourceName() {
    return this.modelService.originalDataSource?.options.key
  }

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
  // 当前使用 MDX 查询
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

  readonly entityType = computed(() => this.entityTypes()[0])

  // readonly dbTablesPrompt = computed(() =>
  //   this.isMDX()
  //     ? `The source dialect is ${this.entityTypes()[0]?.dialect}, the cubes information are ${this.#promptCubes?.join(
  //         '\n'
  //       )}`
  //     : `The database dialect is ${
  //         this.entityTypes()[0]?.dialect
  //       }, the tables information are ${this.promptTables?.join('\n')}`
  // )
  sqlEditorActionLabel = toSignal(
    this.translateService.stream('PAC.MODEL.QUERY.EditorActions', {
      Default: {
        Nl2SQL: 'NL 2 SQL',
        Explain: 'Explain',
        Optimize: 'Optimize'
      }
    })
  )
  // sqlEditorActions = [
  //   {
  //     id: `sql-editor-action-nl-sql`,
  //     label: computed(() => this.sqlEditorActionLabel().Nl2SQL),
  //     action: (text, options) => {
  //       const statement = text || this.statement
  //       if (statement) {
  //         this.answering.set(true)
  //         this.nl2SQL(statement).subscribe((result) => {
  //           this.answering.set(false)
  //           const lines = this.statement.split('\n')
  //           const endLineNumber = text ? options.selection.endLineNumber : lines.length
  //           lines.splice(endLineNumber, 0, result)
  //           this.statement = lines.join('\n')
  //         })
  //       }
  //     }
  //   },
  //   {
  //     id: `sql-editor-action-explain-sql`,
  //     label: computed(() => this.sqlEditorActionLabel().Explain),
  //     action: (text, options) => {
  //       const statement = text || this.statement
  //       if (statement) {
  //         this.answering.set(true)
  //         this.explainSQL(statement).subscribe((result) => {
  //           this.answering.set(false)
  //           const startLineNumber = text ? options.selection.startLineNumber : 1
  //           const lines = this.statement.split('\n')
  //           lines.splice(startLineNumber - 1, 0, `/**\n${result}\n*/`)
  //           this.statement = lines.join('\n')
  //         })
  //       }
  //     }
  //   },
  //   {
  //     id: `sql-editor-action-optimize-sql`,
  //     label: computed(() => this.sqlEditorActionLabel().Optimize),
  //     action: (text, options) => {
  //       const statement = text || this.statement
  //       if (statement) {
  //         this.answering.set(true)
  //         this.optimizeSQL(statement).subscribe((result) => {
  //           this.answering.set(false)
  //           this.statement = this.statement.replace(statement, result)
  //         })
  //       }
  //     }
  //   }
  // ]

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
      // 获取源表或源多维数据集结构
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
    super()

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
    // 排除 query results 拖进来
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
      const subscription = this._query(statement).subscribe()
      this.querySubscription.set(subscription)
    } else {
      this.querySubscription.set(null)
    }
  }

  _query(statement: string) {
    return this.modelService.originalDataSource.query({ statement, forceRefresh: true }).pipe(
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
          if (columns.length === 0 && data.length > 0) {
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
      }),
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
   * 另存为 SQL Model
   */
  saveAsModel() {
    this.modelComponent.createByExpression(this.statement)
  }

  async saveAsDBScript() {
    const statement: string = this.editor.getSelectText()?.trim() || this.statement
    this.modelService.updateModel({ dbInitialization: statement })
  }

  dropEntity(event: CdkDragDrop<{ name: string }[]>) {
    if (event.container === event.previousContainer) {
      this.queryLabService.moveEntityInQuery({ key: this.queryKey(), event })
    } else {
      switch(event.previousContainer.id) {
        case CdkDragDropContainers.Tables: {
          if (event.item.data?.name) {
            this.queryLabService.addEntity({
              key: this.queryKey(),
              entity: event.item.data?.name,
              currentIndex: event.currentIndex
            })
          }
          break
        }
        case CdkDragDropContainers.Entities: {
          if (this.isMDX()) {
            // Add original cube name into list
            this.queryLabService.addEntity({
              key: this.queryKey(),
              entity: event.item.data?.cube?.name,
              currentIndex: event.currentIndex
            })
          } else {
            // Add the fact tables in cube or dimension tables into list
            event.item.data?.cube?.tables.forEach((item, index) => {
              this.queryLabService.addEntity({
                key: this.queryKey(),
                entity: item.name,
                currentIndex: event.currentIndex + index
              })
            })

            event.item.data?.dimension?.hierarchies?.forEach((hierarchy) => {
              hierarchy.tables?.forEach((item, index) => {
                this.queryLabService.addEntity({
                  key: this.queryKey(),
                  entity: item.name,
                  currentIndex: event.currentIndex + index
                })
              })
            })
          }
          break
        }
      }
    }
  }

  drop(event: CdkDragDrop<{ name: string }[]>) {
    const data = event.item.data
    if (!data) {
      return
    }
    let text = data.name
    switch((<EntitySchemaNode>data).type) {
      case EntitySchemaType.Parameter:
        text = serializeVariable(data)
        break
      case EntitySchemaType.Parameters:
        // 暂时仅支持 SAP Variables
        text = `SAP VARIABLES\n` + (data.members?.map(serializeVariable).join('\n') ?? '')
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
    if (modelType === MODEL_TYPE.XMLA) {
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
          statement = `SELECT * FROM ${serializeName(event.item.data.name, dialect)} LIMIT 1000`
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
      switch((<EntitySchemaNode>data).type) {
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

  // async dropCopilot(event: CdkDragDrop<any[], any[], any>) {
  //   const data = event.item.data
  //   if (event.previousContainer.id === 'pac-model__query-entities' && (<EntitySchemaNode>data).type === 'Entity') {
  //     const entityType = await firstValueFrom(this.modelService.selectOriginalEntityType((<EntitySchemaNode>data).name))
  //     this.copilotChat.addMessage({
  //       id: nanoid(),
  //       role: CopilotChatMessageRoleEnum.User,
  //       content: calcEntityTypePrompt(entityType)
  //     })
  //   } else if (event.previousContainer.id === 'pac-model__query-results') {
  //     this.copilotChat.addMessage({
  //       id: nanoid(),
  //       role: CopilotChatMessageRoleEnum.User,
  //       data: {
  //         columns: data.columns,
  //         content: data.preview
  //       },
  //       content:
  //         data.columns.map((column) => column.name).join(',') +
  //         `\n` +
  //         data.preview.map((row) => data.columns.map((column) => row[column.name]).join(',')).join('\n')
  //     })
  //   }
  // }

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

  // nl2SQL(sql: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `请根据给定的表信息和要求给出相应的SQL语句(仅输出 sql 语句)， 要求：\n${sql}，答案：`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }

  // explainSQL(sql: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `请根据给定的表信息解释一下这个SQL语句：\n${sql}`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }

  // optimizeSQL(sql: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `请根据给定的表信息优化一下这个SQL语句(仅输出 sql 语句)：\n${sql}`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }
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

function serializeVariable(data: VariableProperty) {
  return `${data.name} INCLUDING ` + (data.defaultLow ? `${data.referenceHierarchy}.${data.defaultLow}` : `${data.referenceHierarchy}.[]`)
            + (data.defaultHigh ? `:${data.referenceHierarchy}.${data.defaultHigh}` : '')
}