import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, AiProviderRole, CopilotServerService, getErrorMessage, ICopilotModel, injectCopilots, ToastrService } from '../../../@core'
import { PRESET_INSTRUCTIONS } from './agent'
import { CopilotInstructionEditorComponent } from '../instruction-editor/editor.component'
import { CopilotModelSelectComponent } from '../copilot-model-select/select.component'

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

    CopilotModelSelectComponent,
    CopilotInstructionEditorComponent
  ]
})
export class CopilotPromptGeneratorComponent {
  eModelType = AiModelTypeEnum

  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ instruction: string; variables: any[] }>(DIALOG_DATA)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #copilotAPI = inject(CopilotServerService)
  readonly #copilots = injectCopilots()
  readonly PRESET_INSTRUCTIONS = PRESET_INSTRUCTIONS

  readonly instructions = model<string>('')
  readonly copilotModel = model<Partial<ICopilotModel> | null>(null)
  readonly instruction = signal<string>(this.#data?.instruction)
  readonly variables = signal<any[]>(this.#data?.variables)

  readonly promptLength = computed(() => this.instruction()?.length)

  readonly loading = signal(false)
  readonly show = signal(false)

  readonly inheritCopilotModel = computed(() => this.#copilots()?.find((_) => _.role === AiProviderRole.Primary)?.copilotModel)

  generate() {
    this.loading.set(true)
    this.#copilotAPI.generatePrompt(this.instructions(), this.copilotModel()).subscribe({
      next: (result) => {
        this.loading.set(false)
        this.instruction.set(result.prompt)
        this.variables.set(result.variables)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  presetInstruction(name: string) {
    const item = PRESET_INSTRUCTIONS.find((_) => _.key === name)
    this.instructions.set(
      this.#translate.instant(`PAC.Copilot.PromptGenerator.${item.key}.instruction`, { Default: item.instruction })
    )
  }

  toggleGen() {
    this.show.update((v) => !v)
  }

  cancel() {
    this.#dialogRef.close()
  }

  apply() {
    this.#dialogRef.close({instruction: this.instruction(), variables: this.variables()})
  }
}
