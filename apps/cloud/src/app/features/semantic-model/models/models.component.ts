import { HttpErrorResponse } from '@angular/common/http'
import { AfterViewInit, Component, Inject, TemplateRef, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { Router } from '@angular/router'
import { DataSourceService, SemanticModelServerService } from '@metad/cloud/state'
import { NgmDialogComponent } from '@metad/components/dialog'
import { uploadYamlFile } from '@metad/core'
import { NgmConfirmDeleteComponent, NgmConfirmUniqueComponent, NgmSpinComponent, NgmTreeSelectComponent, TreeTableColumn, TreeTableModule } from '@metad/ocap-angular/common'
import { NgmControlsModule } from '@metad/ocap-angular/controls'
import { ButtonGroupDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { AgentType, Property, Syntax } from '@metad/ocap-core'
import { NX_STORY_STORE, NxStoryStore, StoryModel, uuid } from '@metad/story/core'
import { MtxPopoverModule } from '@ng-matero/extensions/popover'
import { formatRelative } from 'date-fns'
import { NgxPermissionsModule } from 'ngx-permissions'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { combineLatestWith, distinctUntilChanged, shareReplay, switchMap, tap } from 'rxjs/operators'
import {
  AnalyticsPermissionsEnum,
  ISemanticModel,
  MenuCatalog,
  ToastrService,
  WasmDBDefaultCatalog,
  WasmDBDialect,
  getDateLocale
} from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language/translation-base.component'
import { AppService } from '../../../app.service'
import { ModelCreationComponent } from '../creation/creation.component'
import { exportSemanticModel } from '../types'
import { SharedModule } from '../../../@shared/shared.module'
import { MaterialModule } from '../../../@shared/material.module'
import { CreatedByPipe } from '../../../@shared/pipes'
import { CdkMenuModule } from '@angular/cdk/menu'

@Component({
  standalone: true,
  imports: [
    SharedModule,
    MaterialModule,
    NgxPermissionsModule,
    MtxPopoverModule,
    CdkMenuModule,
    NgmDialogComponent,

    // OCAP Modles
    NgmTreeSelectComponent,
    NgmSpinComponent,
    TreeTableModule,
    NgmControlsModule,
    ButtonGroupDirective
  ],
  selector: 'pac-models',
  templateUrl: './models.component.html',
  styleUrls: ['./models.component.scss']
})
export class ModelsComponent extends TranslationBaseComponent implements AfterViewInit {
  DisplayDensity = DisplayDensity
  AnalyticsPermissionsEnum = AnalyticsPermissionsEnum

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

  @ViewChild('actions') actions: TemplateRef<any>

  uploadForm = new FormGroup({
    name: new FormControl(),
    businessAreaId: new FormControl(),
    dataSourceId: new FormControl()
  })

  // Loading data
  loading = false
  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly models$ = this.refresh$.pipe(
    combineLatestWith(this.type$.pipe(distinctUntilChanged())),
    switchMap(([, component]) => {
      this.loading = true
      return component === 'my' ? this.store.getMyModelsByAreaTree() : this.store.getModelsByAreaTree()
    }),
    tap(() => (this.loading = false)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly dataSources$ = this.dataSourcesStore.getAll(['type']).pipe(takeUntilDestroyed(), shareReplay(1))

  modelUploading = false

  constructor(
    public appService: AppService,
    private store: SemanticModelServerService,
    private dataSourcesStore: DataSourceService,
    @Inject(NX_STORY_STORE) private storyStore: NxStoryStore,
    private router: Router,
    private _dialog: MatDialog,
    private toastrService: ToastrService
  ) {
    super()
  }

  ngOnInit() {
    this.appService.setNavigation({ catalog: MenuCatalog.Models })
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
      return formatRelative(new Date(value), new Date(), { locale: getDateLocale(currentLang) })
    }
  }

  async onDelete(model: ISemanticModel) {
    const information = this.getTranslation('PAC.MODEL.TOASTR.DeleteModelPermanently', {
      Default: 'Delete this model permanently'
    })
    const result = await firstValueFrom(
      this._dialog
        .open(NgmConfirmDeleteComponent, {
          data: {
            value: model.name,
            information: information + '?'
          }
        })
        .afterClosed()
    )

    if (result) {
      this.loading = true
      await firstValueFrom(this.store.delete(model.id))
      this.loading = true
      this.toastrService.success('PAC.MODEL.TOASTR.ModelDelete', { Default: 'Model delete' })
      this.refresh$.next()
    }
  }

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
        this.toastrService.error(err, '创建故事')
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
          this.store.createNew({
            key: uuid(),
            name: result,
            type: 'SQL',
            agentType: AgentType.Wasm,
            syntax: Syntax.SQL,
            dialect: WasmDBDialect,
            catalog: WasmDBDefaultCatalog
          })
        )
        this.toastrService.success('PAC.MODEL.TOASTR.ModelCreate', { Default: 'Model Create' })
        this.refresh$.next()
      } catch (err) {
        this.toastrService.error(err)
      }
    }
  }

  async onNewModel(businessAreaId?: string, type?: string) {
    const model = await firstValueFrom(
      this._dialog.open(ModelCreationComponent, { data: { businessAreaId, type } }).afterClosed()
    )

    if (model) {
      const result = await firstValueFrom(
        this.store.create({
          ...model,
          key: uuid()
        })
      )
      this.refresh$.next()
    }
  }

  async onDownload(id: string) {
    await exportSemanticModel(this.store, id)
  }

  async onUpload(event) {
    const files = event.target.files[0]
    const fileType = files.name.split('.')
    if (fileType[fileType.length - 1] !== 'yml') {
      this.toastrService.error('PAC.NOTES.STORY.UPLOAD_FILETYPE_ERROR')
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
    // const _model = await firstValueFrom(this._dialog.open(this.uploadTmpl).afterClosed())
    const _model = await firstValueFrom(
      this._dialog
        .open(ModelCreationComponent, {
          data: {
            name: model.name,
            description: model.description,
            type: model.type === 'XMLA' ? 'mdx' : null
          }
        })
        .afterClosed()
    )

    if (_model) {
      model.name = _model.name
      model.description = _model.description
      model.businessAreaId = _model.businessAreaId
      model.dataSourceId = _model.dataSourceId
      model.catalog = _model.catalog
      model.type = _model.type
    } else {
      return
    }

    this.modelUploading = true
    try {
      model = await firstValueFrom(this.store.upload(model))
      this.modelUploading = false
      this.toastrService.success('PAC.MODEL.TOASTR.ModelUpload', { Default: 'Model upload' })
      this.refresh$.next()
    } catch (err) {
      this.modelUploading = false
      this.toastrService.error((<HttpErrorResponse>err).statusText)
    }
  }
}
