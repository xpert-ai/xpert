import { CdkDrag, CdkDragDrop, CdkDragRelease } from '@angular/cdk/drag-drop'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostBinding,
  HostListener,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  computed,
  inject,
  model,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog, MatDialogConfig } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { CopilotChatMessageRoleEnum, CopilotEngine } from '@metad/copilot'
import { nonBlank } from '@metad/core'
import { NgmCommonModule, NgmConfirmDeleteComponent, NgmConfirmUniqueComponent, ResizerModule, SplitterModule } from '@metad/ocap-angular/common'
import { CommandDialogComponent, NgmCopilotChatComponent, provideCopilotDropAction } from '@metad/copilot-angular'
import { DBTable, PropertyAttributes, TableEntity, VirtualCube, pick } from '@metad/ocap-core'
import { NX_STORY_STORE, NxStoryStore, StoryModel } from '@metad/story/core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { lowerCase, snakeCase, sortBy, uniqBy } from 'lodash-es'
import { nanoid } from 'nanoid'
import { NGXLogger } from 'ngx-logger'
import {
  BehaviorSubject,
  Subject,
  catchError,
  combineLatest,
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap
} from 'rxjs'
import { DateRelativePipe, ISemanticModel, MenuCatalog, getErrorMessage, injectToastr, routeAnimations, uuid } from '../../../@core'
import { AppService } from '../../../app.service'
import { exportSemanticModel } from '../types'
import { ModelUploadComponent } from '../upload/upload.component'
import { injectCubeCommand, injectDBACommand, injectDimensionCommand, injectModelerCommand, injectTableCommand, provideCopilotTables } from './copilot'
import {
  CreateEntityDialogDataType,
  CreateEntityDialogRetType,
  ModelCreateEntityComponent
} from './create-entity/create-entity.component'
import { ModelCreateTableComponent } from './create-table/create-table.component'
import { SemanticModelService } from './model.service'
import { ModelPreferencesComponent } from './preferences/preferences.component'
import {
  CdkDragDropContainers,
  MODEL_TYPE,
  ModelCubeState,
  ModelDimensionState,
  SemanticModelEntity,
  SemanticModelEntityType,
  TOOLBAR_ACTION_CATEGORY
} from './types'
import { markdownTableData, stringifyTableType } from './utils'
import { TranslationBaseComponent } from '../../../@shared/language/'
import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TranslateModule } from '@ngx-translate/core'
import { OcapCoreModule, provideOcapCore } from '@metad/ocap-angular/core'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { ModelChecklistComponent } from '@cloud/app/@shared/model'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    ReactiveFormsModule,
    ContentLoaderModule,
    ScrollingModule,
    MatIconModule,
    MatButtonModule,
    MatSidenavModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,

    // OCAP Modules
    ResizerModule,
    SplitterModule,
    OcapCoreModule,
    NgmCommonModule,
    DateRelativePipe,

    ModelChecklistComponent
  ],
  selector: 'ngm-semanctic-model',
  templateUrl: './model.component.html',
  styleUrls: ['./model.component.scss'],
  providers: [NxSettingsPanelService, SemanticModelService, ...provideOcapCore(),],
  host: {
    class: 'ngm-semanctic-model'
  },
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelComponent extends TranslationBaseComponent {
  SemanticModelEntityType = SemanticModelEntityType
  TOOLBAR_ACTION_CATEGORY = TOOLBAR_ACTION_CATEGORY
  eCdkDragDropContainers = CdkDragDropContainers

  public appService = inject(AppService)
  private modelService = inject(SemanticModelService)
  private modelsService = inject(SemanticModelServerService)
  private storyStore = inject<NxStoryStore>(NX_STORY_STORE)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private _dialog = inject(MatDialog)
  readonly #dialog = inject(Dialog)
  private _viewContainerRef = inject(ViewContainerRef)
  readonly #toastr = injectToastr()
  readonly #logger = inject(NGXLogger)
  readonly destroyRef = inject(DestroyRef)
  readonly copilotContext = provideCopilotTables()

  /**
  |--------------------------------------------------------------------------
  | Inputs & Outputs & ViewChild
  |--------------------------------------------------------------------------
  */
  @ViewChild('tableTemplate') tableTemplate!: TemplateRef<any>
  @ViewChild('copilotChat') copilotChat!: NgmCopilotChatComponent

  @HostBinding('class.pac-fullscreen')
  public isFullscreen = false

  // Model
  searchControl = new FormControl()
  // Actions events
  public readonly editorAction$ = new Subject()
  public readonly toolbarAction$ = new Subject<{ category: TOOLBAR_ACTION_CATEGORY; action: string }>()

  get dbInitialization() {
    return this.modelService.modelSignal()?.dbInitialization
  }
  // Left side menu drawer open state
  readonly sideMenuOpened = model(true)

  public id$ = this.route.paramMap.pipe(
    startWith(this.route.snapshot.paramMap),
    map((paramMap) => paramMap.get('id')),
    filter(Boolean),
    map(decodeURIComponent),
    distinctUntilChanged(),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly entities$ = this.modelService.entities$
  readonly cubeStates$ = this.modelService.cubeStates$
  readonly dimensionStates$ = this.modelService.dimensionStates$
  readonly cubes = this.modelService.cubes

  // For tables or cubes in data source
  readonly loadingTables = signal(false)
  readonly dbTablesError = signal('')
  private refreshDBTables$ = new BehaviorSubject<boolean>(null)

  // Refresh DB Tables
  public readonly selectDBTables$ = this.refreshDBTables$.pipe(
    switchMap((forceRefresh) => {
      // Reset fetch tables error
      this.dbTablesError.set(null)
      // Loading status
      this.loadingTables.set(true)
      return this.modelService.selectDBTables(forceRefresh).pipe(
        tap(() => this.loadingTables.set(false)),
        catchError((err) => {
          // When fetch tables error
          this.dbTablesError.set(err.message)
          this.loadingTables.set(false)
          return of([])
        })
      )
    }),
    map((tables) => sortBy(tables, 'name')),
    takeUntilDestroyed(),
    shareReplay(1)
  )
  public readonly entitySets$ = combineLatest([
    this.modelService.tables$.pipe(map((tables) => tables ?? [])),
    this.selectDBTables$
  ]).pipe(
    // merge tables config and db tables, and sort by name
    map(([tables, dbTables]) => sortBy(uniqBy([...tables, ...dbTables], 'name'), 'name') as any[]),
    // Search tables
    combineLatestWith(this.searchControl.valueChanges.pipe(startWith(null), debounceTime(300))),
    map(([entities, text]) => {
      text = text?.toLowerCase()
      if (text) {
        return entities.filter(
          (entity) =>
            entity.caption?.toLowerCase().includes(text) ||
            entity.name.toLowerCase().includes(text) ||
            // Backward compatibility 'label'
            entity.label?.toLowerCase().includes(text)
        )
      }
      return entities
    })
  )

  public readonly stories$ = this.modelService.stories$
  public readonly currentEntityType$ = this.modelService.currentEntityType$

  public readonly virtualCubes$ = this.modelService.virtualCubes$

  public readonly copilotEnabled$ = this.appService.copilotEnabled$

  private readonly dimensions = toSignal(this.modelService.dimensions$)
  readonly cube = computed(() => this.modelService.model()?.cube)

  model: ISemanticModel

  // inner states
  clearingServerCache: boolean

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly isMobile = this.appService.isMobile
  readonly isWasm$ = toSignal(this.modelService.isWasm$)
  readonly isOlap$ = toSignal(this.modelService.isOlap$)
  readonly modelType$ = toSignal(this.modelService.modelType$)
  readonly writable$ = computed(
    () => !this.isWasm$() && (this.modelType$() === MODEL_TYPE.OLAP || this.modelType$() === MODEL_TYPE.SQL)
  )
  readonly tables = toSignal(this.selectDBTables$)

  readonly unsaved = this.modelService.unsaved
  readonly draftSavedDate = this.modelService.draftSavedDate
  readonly latestPublishDate = this.modelService.latestPublishDate
  readonly publishing = signal(false)
  readonly canPublish = this.modelService.canPublish
  readonly checklist = this.modelService.checklist

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #cubeCommand = injectCubeCommand(this.dimensions)
  #dimensionCommand = injectDimensionCommand(this.dimensions)
  #dbaCommand = injectDBACommand()
  #tableCommand = injectTableCommand()
  #entityDropAction = provideCopilotDropAction({
    id: CdkDragDropContainers.Tables,
    implementation: async (event: CdkDragDrop<any[], any[], any>, copilotEngine: CopilotEngine) => {
      this.#logger.debug(`Drop table to copilot chat:`, event)
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
              { name: 'caption', caption: 'Description' }
            ],
            content: Object.values(entityType.properties) as any[],
            header: tableHeader
          },
          content: tableHeader + '\n' + stringifyTableType(entityType),
          templateRef: this.tableTemplate
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
          templateRef: this.tableTemplate
        }
      ]
    }
  })
  #queryResultDropAction = provideCopilotDropAction({
    id: 'pac-model__query-results',
    implementation: async (event: CdkDragDrop<any[], any[], any>, copilotEngine: CopilotEngine) => {
      this.#logger.debug(`Drop query result to copilot chat:`, event)
      const data = event.item.data
      // 自定义查询结果数据
      return {
        id: nanoid(),
        role: CopilotChatMessageRoleEnum.User,
        data: {
          columns: data.columns,
          content: data.preview
        },
        content:
          data.columns.map((column) => column.name).join(',') +
          `\n` +
          data.preview.map((row) => data.columns.map((column) => row[column.name]).join(',')).join('\n'),
        templateRef: this.tableTemplate
      }
    }
  })

  #modelerCommand = injectModelerCommand()


  ngOnInit() {
    this.model = this.route.snapshot.data['storyModel']
    this.appService.setNavigation({ catalog: MenuCatalog.Models, id: this.model.id, label: this.model.name })
    this.modelService.initModel(this.model)
  }

  trackById(i: number, item: SemanticModelEntity) {
    return item.id
  }

  entityPredicate(event: CdkDrag<PropertyAttributes>) {
    return event.dropContainer.id === CdkDragDropContainers.Tables
  }

  dropCube(event: CdkDragDrop<Array<ModelCubeState>>) {
    if (
      event.previousContainer.id === CdkDragDropContainers.Tables &&
      event.container.id === CdkDragDropContainers.Cubes
    ) {
      this.createEntity(event.item.data, SemanticModelEntityType.CUBE)
    }
    // Move items in array
    if (event.previousContainer === event.container) {
      this.modelService.moveItemInCubes(event)
    }
  }

  dropDimension(event: CdkDragDrop<Array<ModelDimensionState>>) {
    if (
      event.previousContainer.id === CdkDragDropContainers.Tables &&
      event.container.id === CdkDragDropContainers.ShareDimensions
    ) {
      this.createEntity(event.item.data, SemanticModelEntityType.DIMENSION)
    }
    // Move items in array
    if (event.previousContainer === event.container) {
      this.modelService.moveItemInDimensions(event)
    }
  }

  dropVirtualCube(event: CdkDragDrop<Array<VirtualCube>>) {
    if (
      event.previousContainer.id === CdkDragDropContainers.Tables &&
      event.container.id === CdkDragDropContainers.VirtualCubes
    ) {
      this.createEntity(event.item.data, SemanticModelEntityType.VirtualCube)
    }
    // Move items in array
    if (event.previousContainer === event.container) {
      this.modelService.moveItemInVirtualCubes(event)
    }
  }

  onDragReleased(event: CdkDragRelease) {
    this.modelService.dragReleased$.next(event.source.dropContainer._dropListRef)
  }

  createEntity(entity?: SemanticModelEntity, type?: SemanticModelEntityType) {
    const modelType = this.modelService.modelType()
    const entitySets = this.tables()
    if (modelType === MODEL_TYPE.XMLA) {
      // Check cube exist
      if (entity?.name && this.cubes().some((_) => _.name === entity.name)) {
        this.#toastr.error('PAC.MODEL.Error_EntityExists', '', {Default: 'Entity already exists!'})
        return
      }
      this.#dialog
        .open<CreateEntityDialogRetType>(
          ModelCreateEntityComponent,
          {
            viewContainerRef: this._viewContainerRef,
            data: {
              model: { name: entity?.name, caption: entity?.caption },
              entitySets,
              modelType,
              type
            },
            backdropClass: 'xp-overlay-share-sheet',
            panelClass: 'xp-overlay-pane-share-sheet',
          }
        )
        .closed.subscribe((result) => {
          if (result) {
            const entity = this.modelService.createCube(result)
            this.activeEntity(entity)
          }
        })
    } else {
     this.#dialog
      .open<CreateEntityDialogRetType>(
        ModelCreateEntityComponent,
          {
            viewContainerRef: this._viewContainerRef,
            data: { 
              model: { table: entity?.name, caption: entity?.caption }, 
              entitySets, 
              modelType,
              type
            },
            backdropClass: 'xp-overlay-share-sheet',
            panelClass: 'xp-overlay-pane-share-sheet',
          }
        )
        .closed.subscribe((result) => {
          if (result) {
            let modelEntity: SemanticModelEntity
            const id = uuid()
            if (result?.type === SemanticModelEntityType.CUBE) {
              modelEntity = this.modelService.createCube(result)
            } else if (result?.type === SemanticModelEntityType.DIMENSION) {
              modelEntity = this.modelService.createDimension(result)
            } else if (result.type === SemanticModelEntityType.VirtualCube) {
              this.modelService.createVirtualCube({ id, ...result })
              this.router.navigate([`virtual-cube/${id}`], { relativeTo: this.route })
            }

            if (modelEntity) {
              this.activeEntity(modelEntity)
            }
          }
        })
    }
  }

  aiCreateEntity() {
    this._dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        disableClose: true,
        data: {
          commands: ['dimension', 'cube', 'table']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }

  /**
   * Open the entity edit page
   *
   * @param entity
   */
  activeEntity(entity: SemanticModelEntity) {
    if (entity.type === SemanticModelEntityType.CUBE) {
      this.router.navigate([`cube/${entity.id}`], { relativeTo: this.route })
    } else {
      this.router.navigate([`dimension/${entity.id}`], { relativeTo: this.route })
    }
  }

  saveModel() {
    this.modelService.saveModel()
  }

  saveAsDefaultCube(name: string) {
    this.modelService.updateDraft({
      cube: name
    })
  }

  createStory() {
    this._dialog
      .open(NgmConfirmUniqueComponent, {
        data: {
          title: this.getTranslation('PAC.KEY_WORDS.StoryName', { Default: 'Story Name' })
        }
      })
      .afterClosed()
      .pipe(
        filter(nonBlank),
        switchMap((name) =>
          this.storyStore.createStory({
            name: name,
            models: [
              {
                id: this.model.id
              } as StoryModel
            ],
            businessAreaId: this.model.businessAreaId
          })
        )
      )
      .subscribe({
        next: (story) => {
          if (story) {
            this.openStory(story.id)
          }
        },
        error: (err) => {
          this.#toastr.error(err, 'PAC.MODEL.MODEL.CreateStory')
        }
      })
  }

  async createByExpression(expression: string) {
    const result = await firstValueFrom(
      this._dialog
        .open<
          ModelCreateEntityComponent,
          CreateEntityDialogDataType,
          CreateEntityDialogRetType
        >(ModelCreateEntityComponent, { data: { model: { expression } } })
        .afterClosed()
    )
    let entity: SemanticModelEntity
    if (result?.type === SemanticModelEntityType.CUBE) {
      entity = this.modelService.createCube(result)
    } else if (result?.type === SemanticModelEntityType.DIMENSION) {
      entity = this.modelService.createDimension(result)
    }

    if (entity) {
      this.activeEntity(entity)
    }
  }

  openStory(id: string) {
    this.router.navigate([`/story/${id}/edit`])
  }

  open(route, name) {
    this.router.navigate([route], { relativeTo: this.route })
  }

  createIndicator() {
    this.router.navigate(['/project/indicators/new'], {
      queryParams: {
        modelId: this.model.id
      }
    })
  }

  refreshSchema() {
    this.refreshDBTables$.next(true)
  }

  deleteEntity(id: string) {
    this.modelService.deleteEntity(id)
    this.router.navigate([`.`], { relativeTo: this.route })
  }

  async addTable() {
    const result = await firstValueFrom(
      this._dialog
        .open(ModelCreateTableComponent, {
          viewContainerRef: this._viewContainerRef,
          disableClose: true
        })
        .afterClosed()
    )
    if (result) {
      this.modelService.addTable(result)
    }
  }

  async editTable(entity: TableEntity) {
    const result = await firstValueFrom(
      this._dialog
        .open(ModelCreateTableComponent, {
          viewContainerRef: this._viewContainerRef,
          disableClose: true,
          data: { model: entity }
        })
        .afterClosed()
    )
    if (result) {
      this.modelService.editTable(result)
    }
  }

  deleteTable(entity: TableEntity) {
    this.modelService.deleteTable(entity.name)
  }

  async removeDBInit() {
    this.modelService.updateDraft({
      dbInitialization: null
    })
  }

  openPreferences() {
    const preferences = ['id', 'key', 'name', 'description', 'dataSourceId', 'catalog', 'visibility', 'preferences']
    const model = this.modelService.modelSignal()
    this.#dialog
      .open(ModelPreferencesComponent, {
        data: pick(model, ...preferences),
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
      })
      .closed
      .subscribe({
        next: (result) => {
          if (result) {
            this.modelService.updateModel(result)
          }
        }
      })
  }

  undo() {
    this.modelService.undo()
  }

  redo() {
    this.modelService.redo()
  }

  doAction(event) {
    this.toolbarAction$.next(event)
  }

  async uploadTable() {
    const result = await firstValueFrom(
      this._dialog
        .open(ModelUploadComponent, {
          panelClass: 'large',
          data: {
            dataSource: this.modelService.originalDataSource,
            id: this.modelService.modelSignal().dataSource.id
          },
          disableClose: true
        } as MatDialogConfig)
        .afterClosed()
    )

    this.refreshSchema()
  }

  tableRemovePredicate(item: CdkDrag<DBTable>) {
    return item.dropContainer.id === CdkDragDropContainers.Tables
  }

  async dropTable(event: CdkDragDrop<DBTable[]>) {
    const tableName = event.item.data.name
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: tableName } }).afterClosed()
    )
    if (confirm) {
      try {
        await this.modelService.originalDataSource.dropEntity(tableName)
        this.#toastr.success('PAC.ACTIONS.Delete')
        this.refreshDBTables$.next(true)
      } catch (err) {
        this.#toastr.error(err)
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey) {
      if (event.shiftKey) {
        if (event.key === 'z' || event.key === 'Z') {
          this.modelService.redo()
          event.preventDefault()
        }
      } else {
        if (event.key === 's' || event.key === 'S') {
          this.modelService.saveModel()
          event.preventDefault()
        } else if (event.key === 'z' || event.key === 'Z') {
          this.modelService.undo()
          event.preventDefault()
        }
      }
    }
  }

  async clearServerCache() {
    this.clearingServerCache = true
    try {
      await firstValueFrom(this.modelsService.deleteCache(this.model.id))
      this.clearingServerCache = false
      this.#toastr.success('PAC.MODEL.ClearServerCache', {Default: 'Clear server cache successfully'})
    } catch (err) {
      this.#toastr.error('PAC.MODEL.ClearServerCache', getErrorMessage(err), {Default: 'Clear server cache failed'})
      this.clearingServerCache = false
    }
  }

  /**
   * Reset model state
   */
  reset() {
    this.modelService.initModel(this.model)
  }

  async onDownload() {
    try {
      await exportSemanticModel(this.modelsService, this.model.id)
    } catch(err) {
      this.#toastr.error(getErrorMessage(err))
    }
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen
    if (this.isFullscreen) {
      this.appService.requestFullscreen(5)
    } else {
      this.appService.exitFullscreen(5)
    }
  }

  closeSidebar() {
    this.sideMenuOpened.set(false)
  }

  saveDraft() {
    this.modelService.saveDraft()
  }

  publish() {
    this.publishing.set(true)
    this.modelsService.publish(this.model.id, '')
      .subscribe({
        next: (model) => {
          this.publishing.set(false)
          window.location.reload()
        },
        error: (err) => {
          this.publishing.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  resume() {
    this.modelsService.updateModel(this.model.id, { 
      key: this.model.key,
      name: this.model.name,
      draft: null
    }).subscribe({
      next: () => {
        window.location.reload()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  duplicateEntity(entity: SemanticModelEntity) {
    const newKey = uuid()
    this.modelService.duplicate({type: entity.type, id: entity.id, newKey})
    const type = snakeCase(lowerCase(entity.type))
    this.router.navigate([type, newKey], { relativeTo: this.route })
  }
}
