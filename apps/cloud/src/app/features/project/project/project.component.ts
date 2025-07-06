import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkTreeModule, FlatTreeControl } from '@angular/cdk/tree'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  model,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialog, MatDialogRef } from '@angular/material/dialog'
import { MatTreeFlatDataSource } from '@angular/material/tree'
import { Router, RouterModule } from '@angular/router'
import { FavoritesService, StoriesService, convertStory } from '@metad/cloud/state'
import { NgmCopilotContextService, NgmCopilotContextToken } from '@metad/copilot-angular'
import { NgmCommonModule, NgmConfirmDeleteComponent, NgmTreeSelectComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective, NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { DisplayBehaviour, FlatTreeNode, TreeNodeInterface, hierarchize } from '@metad/ocap-core'
import { Story } from '@metad/story/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniq } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  firstValueFrom,
  map,
  shareReplay,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs'
import {
  BusinessType,
  CollectionService,
  DefaultCollection,
  DefaultProject,
  ICertification,
  IFavorite,
  IProject,
  ISemanticModel,
  ProjectAPIService,
  Store,
  StoryStatusEnum,
  ToastrService,
  routeAnimations,
  tryHttp
} from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { AppService } from '../../../app.service'
import { injectIndicatorArchitectCommand, injectIndicatorCommand, provideCopilotCubes } from '../copilot/'
import { ReleaseStoryDialog } from '../release-story.component'
import { SelectModelDialog } from '../select-model.component'
import { collectionId, injectFetchModelDetails, treeDataSourceFactory } from '../types'
import { ProjectService } from '../project.service'
import { MaterialModule } from '../../../@shared/material.module'
import { StoryCreationComponent } from '../../../@shared/story'
import { CdkMenuModule } from '@angular/cdk/menu'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    CdkTreeModule,
    RouterModule,
    MaterialModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    NgmCommonModule,
    AppearanceDirective,
    NgmTreeSelectComponent
  ],
  selector: 'pac-project',
  templateUrl: 'project.component.html',
  styleUrls: ['project.component.scss'],
  animations: [routeAnimations],
  providers: [
    ProjectService,
    {
      provide: NgmCopilotContextToken,
      useClass: NgmCopilotContextService
    }
  ]
})
export class ProjectComponent extends TranslationBaseComponent {
  DisplayBehaviour = DisplayBehaviour
  DefaultCollection = DefaultCollection
  StoryStatusEnum = StoryStatusEnum

  readonly projectService = inject(ProjectService)
  readonly collectionService = inject(CollectionService)
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly wasmAgent = inject(WasmAgentService)
  readonly appService = inject(AppService)
  readonly destroyRef = inject(DestroyRef)
  readonly fetchModelDetails = injectFetchModelDetails()
  readonly copilotContext = provideCopilotCubes()

  @ViewChild('collectionCreation') collectionCreation: TemplateRef<ElementRef>
  @ViewChild('moveTo') moveTo: TemplateRef<ElementRef>

  form = new FormGroup({
    name: new FormControl(null, [Validators.required]),
    description: new FormControl(null, []),
    parentId: new FormControl(null, [])
  })

  private dialogRef: MatDialogRef<ElementRef<any>, any>

  dataSource: MatTreeFlatDataSource<TreeNodeInterface<any>, FlatTreeNode<any>>
  treeControl: FlatTreeControl<FlatTreeNode<any>>

  /**
   * @deprecated use projectService
   */
  get project(): IProject {
    return this.projectService.project()
  }
  get isOwner() {
    return this.store.user?.id === this.project?.ownerId
  }

  moveToCollectionId: string
  public bookmarks = []
  public unfoldBookmarks = false

  public models = []
  public modelsExpand = false

  // Is mobile
  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())

  public readonly projectId$ = this.store.selectedProject$.pipe(
    map((project) => (project?.id === DefaultProject.id ? null : project?.id)),
    distinctUntilChanged()
  )
  public readonly refresh$ = new BehaviorSubject<void>(null)
  public readonly collectionStories$ = combineLatest([
    this.refresh$,
    this.store.selectOrganizationId(),
    this.projectId$
  ]).pipe(
    switchMap(([, , projectId]) => {
      return combineLatest([
        this.collectionService.getAll(projectId).pipe(
          withLatestFrom(this.translateService.get('PAC.Project.DefaultCollection', { Default: 'Default' })),
          map(([collections, defaultName]) => [
            {
              __type__: 'collection',
              ...DefaultCollection,
              name: defaultName
            },
            ...collections
          ])
        ),
        this.storiesService.getAllByProject(projectId)
      ])
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  // Collections tree
  readonly collections = toSignal(
    this.collectionStories$.pipe(
      map(([collections]) =>
        hierarchize(collections, {
          parentNodeProperty: 'parentId',
          valueProperty: 'id',
          labelProperty: 'name'
        })
      )
    )
  )

  // Collections and stories tree
  public readonly collectionTree$ = this.collectionStories$.pipe(
    map(([collections, stories]) =>
      hierarchize(
        [
          ...stories.map((item) => ({
            ...item,
            parentId: item.collectionId ?? DefaultCollection.id,
            __type__: 'story'
          })),
          ...collections.map((item) => ({
            ...item,
            __type__: 'collection'
          }))
        ],
        {
          parentNodeProperty: 'parentId',
          valueProperty: 'id',
          labelProperty: 'name'
        }
      )
    )
  )

  // Project ob
  public project$ = this.projectService.project$

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly projectSignal = this.projectService.project
  readonly isDefaultProject = computed(() => {
    return !this.projectSignal()?.id || this.projectSignal()?.id === DefaultProject.id
  })
  readonly projectModels = computed(() => this.projectSignal()?.models)

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private treeNodesSub = this.collectionTree$.pipe(takeUntilDestroyed()).subscribe((tree) => {
    this.dataSource.data = tree
  })
  private _bookmarksSub = this.projectId$
    .pipe(
      switchMap((projectId) =>
        this.favoritesService.getProjectBookmarks(projectId, BusinessType.STORY, ['story', 'story.createdBy'])
      ),
      takeUntilDestroyed()
    )
    .subscribe((bookmarks) => {
      this.bookmarks = bookmarks
    })

  private _projectDetailSub = this.projectId$
    .pipe(
      switchMap((projectId) =>
        this.projectAPI.getOne(projectId ?? null, [
          'owner',
          'models',
          'indicators',
          'indicators.businessArea',
          'indicators.tags',
          'certifications'
        ])
      ),
      takeUntilDestroyed()
    )
    .subscribe((project) => {
      // this._project$.next(project)
      this.projectService.setProject(project)
      // this._cdr.detectChanges()
    })
  /**
  |--------------------------------------------------------------------------
  | Copilot Commands
  |--------------------------------------------------------------------------
  */
  private indicatorCommand = injectIndicatorCommand()
  private indicatorArchitectCommand = injectIndicatorArchitectCommand()

  constructor(
    private store: Store,
    private storiesService: StoriesService,
    private favoritesService: FavoritesService,
    private projectAPI: ProjectAPIService,
    private _dialog: MatDialog,
    private _toastrService: ToastrService,
    private _cdr: ChangeDetectorRef,
    private _router: Router
  ) {
    super()
    const { dataSource, treeControl } = treeDataSourceFactory()
    this.dataSource = dataSource
    this.treeControl = treeControl

    this.appService.inProject.set(true)
    this.destroyRef.onDestroy(() => {
      this.appService.inProject.set(false)
    })
  }

  hasChild = (_: number, node: FlatTreeNode<any>) => node.expandable

  async newCollection(id?: string) {
    this.form.get('parentId').setValue(id)
    this.dialogRef = this._dialog.open(this.collectionCreation)
  }

  async createCollection() {
    if (this.form.valid) {
      try {
        const collection = await firstValueFrom(
          this.collectionService.create({
            ...this.form.value,
            parentId: collectionId(this.form.value.parentId),
            projectId: this.store.selectedProject?.id
          })
        )
        this.form.reset()
        this.dialogRef.close()
        this.refresh$.next()
      } catch (err: any) {
        this._toastrService.error(err.message)
      }
    }
  }

  async deleteCollection(id: string) {
    const confirm = await firstValueFrom(this._dialog.open(NgmConfirmDeleteComponent, { data: {} }).afterClosed())
    if (confirm) {
      await firstValueFrom(this.collectionService.delete(id))
      this.refresh$.next()
    }
  }

  async newStory(_collectionId?: string) {
    const collections = this.collections
    const story = await firstValueFrom(
      this._dialog
        .open(StoryCreationComponent, {
          data: {
            story: {
              collectionId: _collectionId
            },
            models: this.projectSignal().models,
            collections
          }
        })
        .afterClosed()
    )

    if (story) {
      return await this.tryCreateStory(story)
    }
  }

  async tryCreateStory(story: Story) {
    return await tryHttp(
      this.storiesService
        .create(
          convertStory({
            ...story,
            collectionId: collectionId(story.collectionId),
            projectId: this.projectSignal().id
          })
        )
        .pipe(
          switchMap((newStory) =>
            this.storiesService
              .updateModels(
                newStory.id,
                story.models.map((model) => model.id)
              )
              .pipe(
                tap(() => {
                  this.refresh$.next()
                  this._toastrService.success('PAC.Project.CreateStory', { Default: 'Create story' })
                  // Navigate to new story viewer
                  this._router.navigate(['/story', newStory.id, 'edit'])
                })
              )
          )
        )
    )
  }

  async copy(story: Story) {
    const collections = this.collections()
    const _story = await firstValueFrom(
      this._dialog
        .open(StoryCreationComponent, {
          data: {
            story: story,
            collections,
            models: this.project.models
          }
        })
        .afterClosed()
    )

    if (_story) {
      await tryHttp(
        this.storiesService.copy(story.id, _story).pipe(
          tap((newStory) => {
            this.refresh$.next()
            this._router.navigate(['/project', newStory.id])
            this._toastrService.success('PAC.Project.CopyStory', { Default: 'Copy story' })
          })
        )
      )
    }
  }

  editStory(story: Story) {
    this._router.navigate(['/story', story.id, 'edit'])
  }

  async releaseStory(story: Story) {
    try {
      const success = await firstValueFrom(
        this._dialog
          .open(ReleaseStoryDialog, {
            data: {
              story
            }
          })
          .afterClosed()
      )
    } catch (err) {
      this._toastrService.error(err)
    }
  }

  async archiveStory(story: Story) {
    const confirm = await firstValueFrom(
      this._toastrService.confirm(
        {
          code: 'PAC.Project.ConfirmArchiveStory',
          params: {
            Default: 'Are you sure archive the story?'
          }
        },
        {
          verticalPosition: 'top'
        }
      )
    )
    if (confirm) {
      await firstValueFrom(this.storiesService.update(story.id, { status: StoryStatusEnum.ARCHIVED }))
      this._toastrService.success('PAC.Project.Archive')
    }
  }

  async moveStory(story: Story) {
    const moveToCollectionId = await firstValueFrom(this._dialog.open(this.moveTo).afterClosed())
    if (moveToCollectionId) {
      await firstValueFrom(this.storiesService.update(story.id, { collectionId: collectionId(moveToCollectionId) }))
      this.refresh$.next()
    }
  }

  async deleteStory(story: Story) {
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: story.name } }).afterClosed()
    )
    if (!confirm) {
      return
    }

    try {
      await firstValueFrom(this.storiesService.delete(story.id))
      this._toastrService.success('PAC.NOTES.STORY.STORY_DELETED', { name: story.name })
      this.refresh$.next()

      this._router.navigate(['/project'])
    } catch (err) {
      this._toastrService.error('PAC.NOTES.STORY.STORY_DELETED', '', { name: story.name })
    }
  }

  async removeBookmark(bookmark: IFavorite) {
    await firstValueFrom(this.favoritesService.delete(bookmark.id))
    this.bookmarks = this.bookmarks.filter((item) => item.id !== bookmark.id)
  }

  async addModel() {
    const project = this.project
    if (project?.id) {
      const models = await firstValueFrom(
        this._dialog.open(SelectModelDialog, { data: { models: project.models } }).afterClosed()
      )
      if (models) {
        const newProject = await firstValueFrom(
          this.projectAPI.updateModels(project.id, uniq([...models, ...project.models].map(({ id }) => id)))
        )
        this.projectService.updateProject({
          models: newProject.models
        })
        // this._project$.next({
        //   ...this.project,
        //   models: newProject.models
        // })
        this.modelsExpand = true
        this._cdr.detectChanges()
      }
    }
  }

  async removeModel(model: ISemanticModel) {
    const project = this.project
    if (project?.id) {
      const confirm = await firstValueFrom(
        this._dialog.open(NgmConfirmDeleteComponent, { data: { value: model.name } }).afterClosed()
      )
      if (confirm) {
        await firstValueFrom(this.projectAPI.deleteModel(project.id, model.id))
        this.project.models = this.project.models.filter((item) => item.id !== model.id)
        this.modelsExpand = true
        this._cdr.detectChanges()
      }
    }
  }

  async onDropModels(event: CdkDragDrop<ISemanticModel[]>) {
    moveItemInArray(this.project.models, event.previousIndex, event.currentIndex)
    await firstValueFrom(
      this.projectAPI.updateModels(
        this.project.id,
        this.project.models.map(({ id }) => id)
      )
    )
  }

  // _addIndicator(indicator: IIndicator) {
  //   this.projectService.updateProject((project) => ({
  //     ...project,
  //     indicators: [indicator, ...project.indicators]
  //   }))
  //   // this._project$.next({
  //   //   ...this.project,
  //   //   indicators: [indicator, ...this.project.indicators]
  //   // })
  // }

  // async refreshIndicators() {
  //   const project = await firstValueFrom(
  //     this.projectsService.getOne(this.project.id ?? null, ['indicators', 'indicators.businessArea'])
  //   )
  //   this.projectService.updateProject({
  //     indicators: project.indicators
  //   })
  //   // this._project$.next({ ...this.project, indicators: project.indicators })
  // }

  updateCertifications(certifications: ICertification[]) {
    this.projectService.updateProject({
      certifications
    })
    // this._project$.next({
    //   ...this.project,
    //   certifications
    // })
  }
}
