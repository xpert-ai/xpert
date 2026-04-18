import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { RouterModule } from '@angular/router'
import { IXpert } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { EmojiAvatarComponent } from '../../../@shared/avatar'

@Component({
  standalone: true,
  selector: 'xp-project-assistant-picker',
  imports: [CommonModule, RouterModule, TranslatePipe, NgmSpinComponent, EmojiAvatarComponent],
  templateUrl: './project-assistant-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectAssistantPickerComponent {
  readonly assistants = input<IXpert[]>([])
  readonly selectedAssistantId = input<string | null>(null)
  readonly loading = input(false)
  readonly error = input<string | null>(null)
  readonly assistantSelected = output<string>()

  readonly search = signal('')
  readonly filteredAssistants = computed(() => {
    const query = this.search().trim().toLowerCase()
    if (!query) {
      return this.assistants()
    }

    return this.assistants().filter((assistant) =>
      [assistant.id, assistant.slug, assistant.name, assistant.title, assistant.titleCN]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(query))
    )
  })

  updateSearch(value: string) {
    this.search.set(value)
  }

  selectAssistant(assistantId: string) {
    this.assistantSelected.emit(assistantId)
  }

  getAssistantLabel(assistant: IXpert) {
    return assistant.title || assistant.name || assistant.slug || assistant.id
  }

  getAssistantDescription(assistant: IXpert) {
    return (
      assistant.description ||
      assistant.titleCN ||
      'PAC.Project.MainAgentPickerDescriptionFallback'
    )
  }
}
