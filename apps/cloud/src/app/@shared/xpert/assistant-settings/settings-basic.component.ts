import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, TagCategoryEnum, type TCopilotModel } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { SettingsModelSelectComponent } from './settings-model-select.component'
import { TagSelectComponent } from '@cloud/app/@shared/tag'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { modelValidator } from './xpert-settings.form'

@Component({
  selector: 'xp-settings-basic',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    ZardButtonComponent,
    ZardInputDirective,
    EmojiAvatarComponent,
    SettingsModelSelectComponent,
    TagSelectComponent
  ],
  templateUrl: './settings-basic.component.html'
})
export class SettingsBasicComponent {
  readonly page = input.required<'general' | 'models'>()
  readonly editor = inject(XpertSettingsEditor)
  readonly general = this.editor.form.controls.general.controls
  readonly models = this.editor.form.controls.models.controls
  readonly modelType = AiModelTypeEnum.LLM
  readonly tagCategory = TagCategoryEnum.XPERT
  addModel() {
    this.models.allowed.push(new FormControl<TCopilotModel | null>(null, modelValidator))
  }
  removeModel(index: number) {
    this.models.allowed.removeAt(index)
  }
  moveModel(index: number, offset: number) {
    this.reorder(index, index + offset)
  }
  dropModel(event: CdkDragDrop<FormControl<TCopilotModel | null>[]>) {
    this.reorder(event.previousIndex, event.currentIndex)
  }
  private reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= this.models.allowed.length) return
    const control = this.models.allowed.at(from)
    this.models.allowed.removeAt(from, { emitEvent: false })
    this.models.allowed.insert(to, control)
  }
}
