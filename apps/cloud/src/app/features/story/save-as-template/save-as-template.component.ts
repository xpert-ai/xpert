// Angular standalone component
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { ChartAnnotation, DataSettings, isNil, omit, omitBy, pick } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NX_STORY_STORE, NxStoryStore, Story, StoryPoint, StoryPointState } from '@metad/story/core'
import { firstValueFrom } from 'rxjs'
import {
  IStoryTemplate,
  ScreenshotService,
  StoryTemplateService,
  StoryTemplateType,
  TagCategoryEnum,
  ToastrService,
  getErrorMessage,
  uuid
} from '../../../@core'
import { MaterialModule } from '../../../@shared/material.module'
import { TagEditorComponent } from '../../../@shared/tag'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    MaterialModule,
    ButtonGroupDirective,
    AppearanceDirective,
    DensityDirective,
    TagEditorComponent
  ],
  selector: 'pac-save-as-template',
  templateUrl: './save-as-template.component.html',
  styleUrls: ['./save-as-template.component.scss']
})
export class SaveAsTemplateComponent {
  StoryTemplateType = StoryTemplateType
  eTagCategoryEnum = TagCategoryEnum

  private _dialogRef = inject(MatDialogRef<SaveAsTemplateComponent>)
  private readonly data: { story: Story; storyTemplate: IStoryTemplate; points: StoryPoint[] } =
    inject(MAT_DIALOG_DATA)
  private readonly storyStore: NxStoryStore = inject(NX_STORY_STORE)
  private readonly storyTemplateService = inject(StoryTemplateService)
  private readonly screenshotService = inject(ScreenshotService)
  private readonly toastrService = inject(ToastrService)
  private readonly translate = inject(TranslateService)

  file: File
  imagePreview: string | ArrayBuffer | null = null
  error: string | null = null
  formGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    description: new FormControl(''),
    type: new FormControl(StoryTemplateType.Theme),
    isPublic: new FormControl(false),
    previewId: new FormControl(null),
    thumbnail: new FormControl(null),
    tags: new FormControl([])
  })
  get type() {
    return this.formGroup.get('type').value
  }

  uploading = false

  storyPoints: StoryPoint[] = []
  asTemplate: IStoryTemplate

  async ngOnInit() {
    this.asTemplate = await firstValueFrom(this.storyTemplateService.getOneByStory(this.data.story.id))
    if (this.asTemplate) {
      this.formGroup.patchValue(this.asTemplate)
      this.imagePreview = this.asTemplate.preview?.url ?? this.asTemplate.thumbnail
    } else {
      this.formGroup.patchValue(this.data.story)
      this.imagePreview = this.data.story.preview?.url ?? this.data.story.thumbnail
    }
    this.formGroup.markAsPristine()

    this.storyPoints = this.data.points.map((state) => ({ ...state, widgets: state.widgets }))
  }

  onFileSelected(event: Event): void {
    this.error = null
    this.file = (event.target as HTMLInputElement).files?.[0]
    if (this.file) {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as String;
        // File size check (There is an error)
        if (result.length > 3*(2**20)) { // Note: 2*2**20 = 2MB
          this.error = `${this.translate.instant('Story.Template.PreviewExceedsMaximum', {Default: 'File exceeds the maximum size'})} 2MB`
          this.file = null
        } else {
          this.imagePreview = reader.result
        }
      }
      reader.readAsDataURL(this.file)
    }
  }

  async save() {
    const story = this.data.story
    try {
      this.uploading = true
      const storyTemplate = this.asTemplate
        ? {
            id: this.asTemplate.id,
            storyId: story.id,
            ...(await saveAsTemplate(this.type, story, this.storyPoints, this.storyStore)),
            ...this.formGroup.value
          }
        : {
            key: uuid(),
            name: story.name,
            description: story.description,
            ...(await saveAsTemplate(this.type, story, this.storyPoints, this.storyStore)),
            storyId: story.id,
            ...this.formGroup.value
          }
      if (this.file) {
        const screenshot = await this.uploadScreenshot(this.file)
        this.file = null
        storyTemplate.previewId = screenshot.id
      }

      let asTemplate: IStoryTemplate = storyTemplate
      if (this.asTemplate) {
        await firstValueFrom(this.storyTemplateService.update(this.asTemplate.id, storyTemplate))
      } else {
        asTemplate = await firstValueFrom(this.storyTemplateService.create(storyTemplate))
      }

      this.toastrService.success('Story.Template.CreateOrUpdateTemplate', { Default: 'Create or update template' })
      this._dialogRef.close(asTemplate)
    } catch (err) {
      this.toastrService.error(getErrorMessage(err))
      this.uploading = false
    }
  }

  async uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return await firstValueFrom(this.screenshotService.create(formData))
  }

  deletePreview() {
    this.file = null
    this.imagePreview = null
    this.error = null
    this.formGroup.patchValue({ previewId: null, thumbnail: null })
  }
}

export async function saveAsTemplate(
  type: StoryTemplateType,
  story: Story,
  storyPoints: StoryPoint[],
  storyStore: NxStoryStore
): Promise<Partial<IStoryTemplate>> {
  const options: IStoryTemplate['options'] = {
    story: pick(story, 'options') as {options: Record<string, unknown>},
  }
  if (type === StoryTemplateType.Template) {
    options.pages = []
    for (const point of storyPoints) {
      let widgets = point.widgets
      if (!point.widgets) {
        const storyPoint = await firstValueFrom(storyStore.getStoryPoint(story.id, point.id))
        widgets = storyPoint.widgets
      }
      options.pages.push({
        ...pick(point, 'key', 'index', 'name', 'type', 'gridOptions', 'styling'),
        widgets: widgets.map((widget) => ({
          ...omit(
            widget,
            'id',
            'createdAt',
            'createdById',
            'updatedAt',
            'updatedById',
            'organizationId',
            'tenantId',
            'pointId',
            'storyId',
            'visibility'
          ),
          dataSettings: widget.dataSettings ? saveDataSettingsAsTemplate(widget.dataSettings) : null
        }))
      })
    }
  }

  return {
    options
  }
}

export function saveDataSettingsAsTemplate(dataSettings: DataSettings) {
  return omitBy(
    {
      ...dataSettings,
      chartAnnotation: saveChartAnnotationAsTemplate(dataSettings.chartAnnotation),
      dataSource: null,
      entitySet: null
    },
    isNil
  )
}

export function saveChartAnnotationAsTemplate(chartAnnotation: ChartAnnotation) {
  return !chartAnnotation
    ? null
    : {
        ...chartAnnotation,
        dimensions: chartAnnotation.dimensions?.map((dimension) =>
          omit(dimension, 'dimension', 'hierarchy', 'level', 'members')
        ),
        measures: chartAnnotation.measures?.map((item) =>
          omit(item, 'dimension', 'hierarchy', 'level', 'measure', 'members')
        )
      }
}
