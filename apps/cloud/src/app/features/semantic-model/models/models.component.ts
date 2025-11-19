import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { AfterViewInit, Component, inject, Inject, signal, TemplateRef, viewChild, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { ModelCreationComponent } from '@cloud/app/@shared/model'
import { DataSourceService, IBusinessArea, SemanticModelServerService } from '@metad/cloud/state'
import { uploadYamlFile } from '@metad/core'
import {
  NgmConfirmUniqueComponent,
  NgmSpinComponent,
  TreeTableColumn,
  TreeTableModule
} from '@metad/ocap-angular/common'
import { NgmControlsModule } from '@metad/ocap-angular/controls'
import { ButtonGroupDirective, DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { AgentType, Property, Syntax } from '@metad/ocap-core'
import { NX_STORY_STORE, NxStoryStore, StoryModel, uuid } from '@metad/story/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { formatRelative } from 'date-fns'
import { NgxPermissionsModule } from 'ngx-permissions'
import { BehaviorSubject, EMPTY, firstValueFrom } from 'rxjs'
import { combineLatestWith, distinctUntilChanged, shareReplay, switchMap, tap } from 'rxjs/operators'
import {
  AnalyticsPermissionsEnum,
  getDateLocale,
  getErrorMessage,
  injectToastr,
  ISemanticModel,
  MenuCatalog,
  WasmDBDefaultCatalog,
  WasmDBDialect
} from '../../../@core'
import { CreatedByPipe } from '../../../@shared/pipes'
import { AppService } from '../../../app.service'
import { exportSemanticModel } from '../types'
import { BusinessAreaSelectComponent } from '@cloud/app/@shared/business-area'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    NgxPermissionsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    MatButtonModule,
    MatIconModule,
    RouterModule,

    // OCAP Modles
    ButtonGroupDirective,
    DensityDirective,
    NgmSpinComponent,
    TreeTableModule,
    NgmControlsModule
  ],
  selector: 'pac-models',
  templateUrl: './models.component.html',
  styleUrls: ['./models.component.scss']
})
export class ModelsComponent implements AfterViewInit {
  DisplayDensity = DisplayDensity
  AnalyticsPermissionsEnum = AnalyticsPermissionsEnum

  readonly modelsAPI = inject(SemanticModelServerService)
  readonly #toastr = injectToastr()
  readonly translateService = inject(TranslateService)
  readonly #dialog = inject(Dialog)

  displayedColumns = ['name', 'dataSource']
  columns: Array<
    Property & {
      cellTemplate?: TemplateRef<any>
      pipe?: (value: any) => any
    }
  > = []

  get type() {
    return this.type$.value
  }
  set type(value) {
    this.type$.next(value)
  }
  private type$ = new BehaviorSubject<string>('my')

  // Children
  @ViewChild('actions') actions: TemplateRef<any>
  readonly descTempl = viewChild('descTempl', { read: TemplateRef })

  uploadForm = new FormGroup({
    name: new FormControl(),
    businessAreaId: new FormControl(),
    dataSourceId: new FormControl()
  })

  // Loading data
  readonly loading = signal(false)
  private readonly refresh$ = new BehaviorSubject<void>(null)

  readonly models$ = this.refresh$.pipe(
    combineLatestWith(this.type$.pipe(distinctUntilChanged())),
    switchMap(([, component]) => {
      this.loading.set(true)
      return component === 'my' ? this.modelsAPI.getMyModelsByAreaTree() : this.modelsAPI.getModelsByAreaTree()
    }),
    tap(() => (this.loading.set(false))),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  readonly dataSources$ = this.dataSourcesStore.getAll(['type']).pipe(takeUntilDestroyed(), shareReplay(1))

  readonly modelUploading = signal(false)

  constructor(
    public appService: AppService,
    private dataSourcesStore: DataSourceService,
    @Inject(NX_STORY_STORE) private storyStore: NxStoryStore,
    private router: Router,
    private _dialog: MatDialog
  ) {}

  ngOnInit() {
    this.appService.setNavigation({ catalog: MenuCatalog.Models })
  }

  getTranslation(key: string, interpolateParams?: any): string {
    return this.translateService.instant(key, interpolateParams)
  }

  ngAfterViewInit(): void {
    this.columns = [
      {
        name: 'type',
        caption: this.getTranslation('PAC.MODEL.Type', { Default: 'Type' })
      },
      {
        name: 'dataSource',
        caption: this.getTranslation('PAC.MODEL.DataSource', { Default: 'Data Source' })
      },
      {
        name: 'description',
        caption: this.getTranslation('PAC.KEY_WORDS.Description', { Default: 'Description' }),
        cellTemplate: this.descTempl()
      },
      {
        name: 'createdBy',
        caption: this.getTranslation('PAC.MODEL.CreatedBy', { Default: 'Created By' }),
        pipe: (value) => new CreatedByPipe().transform(value)
      },
      {
        name: 'updatedAt',
        caption: this.getTranslation('PAC.KEY_WORDS.UpdatedAt', { Default: 'Updated At' }),
        pipe: this.getUpdatedAtPipe()
      },
      {
        name: 'publishAt',
        caption: this.getTranslation('PAC.KEY_WORDS.PublishedAt', { Default: 'Published At' }),
        pipe: this.getUpdatedAtPipe()
      },
      {
        name: 'actions',
        caption: this.getTranslation('PAC.MODEL.Actions', { Default: 'Actions' }),
        cellTemplate: this.actions,
        stickyEnd: true
      }
    ] as TreeTableColumn[]
  }

  getUpdatedAtPipe() {
    const currentLang = this.translateService.currentLang
    return (value: Date) => {
      return value && formatRelative(new Date(value), new Date(), { locale: getDateLocale(currentLang) })
    }
  }

  // async onDelete(model: ISemanticModel) {
  //   const information = this.getTranslation('PAC.MODEL.TOASTR.DeleteModelPermanently', {
  //     Default: 'Delete this model permanently'
  //   })
  //   const result = await firstValueFrom(
  //     this._dialog
  //       .open(NgmConfirmDeleteComponent, {
  //         data: {
  //           value: model.name,
  //           information: information + '?'
  //         }
  //       })
  //       .afterClosed()
  //   )

  //   if (result) {
  //     this.loading = true
  //     await firstValueFrom(this.store.delete(model.id))
  //     this.loading = true
  //     this.#toastr.success('PAC.MODEL.TOASTR.ModelDelete', { Default: 'Model delete' })
  //     this.refresh$.next()
  //   }
  // }

  async createStory(model: StoryModel) {
    const name = await firstValueFrom(this._dialog.open(NgmConfirmUniqueComponent, {}).afterClosed())

    if (name) {
      try {
        const story = await firstValueFrom(
          this.storyStore.createStory({
            name: name,
            model,
            businessAreaId: model.businessAreaId
          })
        )
        this.openStory(story.id)
      } catch (err) {
        this.#toastr.error(err, '创建故事')
      }
    }
  }

  openStory(id: string) {
    this.router.navigate([`/story/${id}/edit`])
  }

  async onNewWASMModel() {
    const result = await firstValueFrom(this._dialog.open(NgmConfirmUniqueComponent).afterClosed())
    if (result) {
      try {
        await firstValueFrom(
          this.modelsAPI.createNew({
            key: uuid(),
            name: result,
            type: 'SQL',
            agentType: AgentType.Wasm,
            syntax: Syntax.SQL,
            dialect: WasmDBDialect,
            catalog: WasmDBDefaultCatalog
          })
        )
        this.#toastr.success('PAC.MODEL.TOASTR.ModelCreate', { Default: 'Model Create' })
        this.refresh$.next()
      } catch (err) {
        this.#toastr.error(err)
      }
    }
  }

  onNewModel(businessAreaId?: string, type?: string) {
    this.#dialog
      .open<Partial<ISemanticModel>>(ModelCreationComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: { businessAreaId, type }
      })
      .closed.pipe(
        switchMap((model) => {
          if (model) {
            return this.modelsAPI.create({
              ...model,
              key: uuid()
            })
          }
          return EMPTY
        })
      )
      .subscribe((model) => {
        this.refresh$.next()
        this.router.navigate(['/models', model.id])
      })
  }

  async onDownload(id: string) {
    try {
      await exportSemanticModel(this.modelsAPI, id)
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
    }
  }

  async onUpload(event) {
    const files = event.target.files[0]
    const fileType = files.name.split('.')
    if (!['yml', 'yaml'].includes(fileType[fileType.length - 1])) {
      this.#toastr.error('PAC.NOTES.STORY.UPLOAD_FILETYPE_ERROR')
      return
    }

    const model = await uploadYamlFile(files)
    await this.uploadModel(model)
  }

  async uploadModel(model: ISemanticModel) {
    this.uploadForm.reset({
      name: model.name,
      businessAreaId: null,
      dataSourceId: null
    })

    const _model = await firstValueFrom(
      this.#dialog.open<Partial<ISemanticModel>>(ModelCreationComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          name: model.name,
          description: model.description,
          type: model.type === 'XMLA' ? 'mdx' : null
        }
      }).closed
    )

    if (_model) {
      model.name = _model.name
      model.description = _model.description
      model.businessAreaId = _model.businessAreaId
      model.dataSourceId = _model.dataSourceId
      model.catalog = _model.catalog
      model.type = _model.type
      if (model.draft) {
        model.draft = {
          ...model.draft,
          ..._model
        }
      }
    } else {
      return
    }

    this.modelUploading.set(true)
    try {
      model = await firstValueFrom(this.modelsAPI.upload(model))
      this.modelUploading.set(false)
      this.#toastr.success('PAC.MODEL.TOASTR.ModelUpload', { Default: 'Model upload' })
      this.router.navigate(['/models', model.id])
    } catch (err) {
      this.modelUploading.set(false)
      this.#toastr.error((<HttpErrorResponse>err).statusText)
    }
  }

  moveToBusinessArea(model: ISemanticModel) {
    this.#dialog.open<IBusinessArea>(BusinessAreaSelectComponent, {
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
      }
    }).closed.subscribe((area) => {
      if (area) {
        this.loading.set(true)
        this.modelsAPI.updateModel(model.id, {
          businessAreaId: area.id
        }).subscribe({
          next: () => {
            this.loading.set(false)
            this.#toastr.success('PAC.MODEL.ModelUpdateBusinessArea', { Default: 'Model business area updated' })
            this.refresh$.next()
          },
          error: (err) => {
            this.loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
      }
    })
  }
}
