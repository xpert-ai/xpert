import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage, ToastrService } from '../../../@core'
import { injectPromptGenerator, PRESET_INSTRUCTIONS } from './agent'
import { CopilotInstructionEditorComponent } from '../instruction-editor/editor.component'

@Component({
  standalone: true,
  selector: 'copilot-prompt-generator',
  templateUrl: './generator.component.html',
  styleUrls: ['./generator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    DragDropModule,
    MatTooltipModule,
    NgmSpinComponent,

    CopilotInstructionEditorComponent
  ]
})
export class CopilotPromptGeneratorComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ instruction: string }>(DIALOG_DATA)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly PRESET_INSTRUCTIONS = PRESET_INSTRUCTIONS

  readonly promptGenerator = injectPromptGenerator()

  readonly instructions = model<string>('')

  readonly instruction = signal<string>(this.#data?.instruction)

  readonly promptLength = computed(() => this.instruction()?.length)

  readonly loading = signal(false)

  async generate() {
    this.loading.set(true)
    try {
      const result = await this.promptGenerator().invoke({
        TASK_DESCRIPTION: this.instructions()
      })

      let content = result.content as string
      content = content.replace(/^```[a-zA-Z]*\n/, '')
      content = content.replace(/```$/, '')
      this.instruction.set(content)
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
    } finally {
      this.loading.set(false)
    }
  }

  presetInstruction(name: string) {
    const item = PRESET_INSTRUCTIONS.find((_) => _.key === name)
    this.instructions.set(
      this.#translate.instant(`PAC.Copilot.PromptGenerator.${item.key}.instruction`, { Default: item.instruction })
    )
  }

  cancel() {
    this.#dialogRef.close()
  }

  apply() {
    this.#dialogRef.close(this.instruction())
  }
}
