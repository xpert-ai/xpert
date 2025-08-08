import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatChipsModule } from '@angular/material/chips'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatSelectModule } from '@angular/material/select'
import { Router } from '@angular/router'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Story, StoryModel, StoryOptions } from '@metad/story/core'
import { Subject, combineLatestWith, filter, firstValueFrom, map, startWith, switchMap, tap } from 'rxjs'
import { ISemanticModel, ProjectAPIService, ScreenshotService, ToastrService } from '../../../@core'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatIconModule,
    MatButtonModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatCheckboxModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    DragDropModule,
    OcapCoreModule,
    NgmHighlightDirective
  ],
  selector: 'ngm-story-details',
  templateUrl: './story-details.component.html',
  styleUrls: ['./story-details.component.scss']
})
export class StoryDetailsComponent implements OnInit {
  private readonly screenshotService = inject(ScreenshotService)
  private readonly projectAPI = inject(ProjectAPIService)
  public readonly toastrService = inject(ToastrService)
  public readonly data = inject<Story>(MAT_DIALOG_DATA)
  public dialogRef? = inject(MatDialogRef<StoryDetailsComponent>)
  private readonly router = inject(Router)
  private readonly translate = inject(TranslateService)

  @ViewChild('modelInput') modelInput: ElementRef<HTMLInputElement>

  c_details = 'details'
  c_thumbnail = 'thumbnail'

  activeLink = 'details'
  name: string
  description: string
  thumbnail: string
  previewId: string
  details: StoryOptions

  file: File
  imagePreview: string | ArrayBuffer | null
  error: string = null

  modelCtrl = new FormControl(null)
  projectId$ = new Subject<string>()

  models$ = toSignal<ISemanticModel[], ISemanticModel[]>(
    this.projectId$.pipe(
      switchMap((id) => this.projectAPI.getOne(id, ['models'])),
      map((project) => project.models),
      tap((models) => {
        this.models.set(this.models().map((model) => models.find((m) => m.id === model.id) ?? model))
      }),
      combineLatestWith(
        this.modelCtrl.valueChanges.pipe(
          filter((value) => typeof value === 'string' || value === null),
          startWith('')
        )
      ),
      map(([models, filter]) =>
        filter ? models.filter((model) => model.name.toLowerCase().includes(filter.toLowerCase())) : models
      )
    ),
    { initialValue: [] }
  )

  get highlight() {
    return this.modelCtrl.value
  }

  models = signal<ISemanticModel[]>([])

  constructor() {
    this.projectId$.next(this.data.projectId)
    if (this.data.models?.length) {
      this.models.set(this.data.models)
    } else if (this.data.modelId) {
      this.models.set([
        {
          id: this.data.modelId
        }
      ])
    }
  }

  ngOnInit() {
    this.reset()
  }

  displayWithName(model: ISemanticModel) {
    return model?.name
  }

  removeModel(model: ISemanticModel) {
    this.models.set(this.models().filter((m) => m.id !== model.id))
  }

  modelSelected(event: MatAutocompleteSelectedEvent): void {
    const model = event.option.value as ISemanticModel
    if (!this.models().some((m) => m.id === model.id)) {
      this.models.set([...this.models(), event.option.value])
    }
    this.modelInput.nativeElement.value = ''
    this.modelCtrl.setValue(null)
  }

  onFileSelected(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0]
    if (this.file) {
      this.error = null
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        if (result.length > 3*(2**20)) { // Note: 2*2**20 = 2MB
          this.error = `${this.translate.instant('Story.StoryDetails.PreviewExceedsMaximum', {Default: 'File exceeds the maximum size'})} 2MB`
          this.file = null
        } else {
          this.imagePreview = result
        }
      }
      reader.readAsDataURL(this.file)
    }
  }

  deleteThumbnail() {
    this.previewId = ''
    this.file = null
    this.imagePreview = null
  }

  onThumbnailChange(url: string) {
    this.imagePreview = url
  }

  openSemanticModel(key: string) {
    const url = this.router.serializeUrl(this.router.createUrlTree(['models', key]))
    window.open(url, '_blank')
  }

  async onApply() {
    const story: Story = {
      name: this.name,
      description: this.description,
      previewId: this.previewId,
      thumbnail: this.thumbnail,
      options: this.details,
      models: this.models() as StoryModel[]
    }
    // If new thumbnail file
    if (this.file) {
      const screenshot = await this.uploadScreenshot(this.file)
      ;(story.previewId = screenshot.id), (story.thumbnail = screenshot.url)
    }
    this.dialogRef.close(story)
  }

  reset() {
    this.name = this.data.name
    this.description = this.data.description
    this.previewId = this.data.previewId
    this.imagePreview = this.data.thumbnail || this.data.preview?.url
    this.thumbnail = this.data.thumbnail
    this.details = cloneDeep(this.data.options) || {}
  }

  async uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return await firstValueFrom(this.screenshotService.create(formData))
  }
}
