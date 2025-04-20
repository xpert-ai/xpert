import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { assign, cloneDeep } from '@metad/ocap-core'
import { PreferencesSchema, StoryPreferencesFields } from '@metad/story'
import { NxStoryService, StoryPreferences } from '@metad/story/core'
import { FORMLY_W_1_2 } from '@metad/story/designer'
import { FormlyFieldConfig, FormlyFormOptions, FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { combineLatest, debounceTime, map, startWith } from 'rxjs'
import { MatTabsModule } from '@angular/material/tabs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTabsModule,
    FormlyModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-designer',
  templateUrl: './story-designer.component.html',
  styleUrls: ['./story-designer.component.scss'],
  host: {
    class: 'pac-story-designer'
  }
})
export class StoryDesignerComponent {
  private readonly translateService = inject(TranslateService)
  public readonly storyService = inject(NxStoryService)

  formGroup = new FormGroup({})

  fields: FormlyFieldConfig[]
  options: FormlyFormOptions
  model = {}

  // For story
  readonly storyFields = toSignal(
    this.translateService.get('Story').pipe(
      map((i18n) => {
        return StoryPreferencesFields(FORMLY_W_1_2, i18n)
      })
    )
  )
  storyFormGroup = new FormGroup({})
  storyOptions: FormlyFormOptions
  storyModel = {}

  private valueSub = combineLatest([
    this.formGroup.valueChanges.pipe(startWith(null)),
    this.storyFormGroup.valueChanges.pipe(startWith(null))
  ])
    .pipe(debounceTime(300), takeUntilDestroyed())
    .subscribe(([preferences, story]) => {
      const value = { ...(preferences ?? {}) } as StoryPreferences
      if (story) {
        value.story = story
      }
      this.storyService.updateStoryPreferences(value)
    })

  private preferencesSub = this.translateService
    .get('Story')
    .pipe(takeUntilDestroyed())
    .subscribe((CSS) => {
      this.fields = PreferencesSchema(CSS)
    })

  async ngOnInit() {
    const preferences = this.storyService.preferences() ?? {}
    this.formGroup.patchValue(preferences)
    this.model = assign(this.model, cloneDeep(preferences))
    this.storyFormGroup.patchValue(preferences.story ?? {})
    this.storyModel = assign(this.storyModel, cloneDeep(preferences.story ?? {}))
  }

  onModelChange(event) {
    //
  }
}
