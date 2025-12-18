import { CommonModule } from '@angular/common'
import {
  ChangeDetectorRef,
  Component,
  ComponentRef,
  computed,
  effect,
  inject,
  input,
  model,
  Type,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  BIInterruptMessageType,
  InterruptMessageType,
  isInterruptMessage,
  TInterruptMessage,
  TSensitiveOperation
} from '../../../@core'
import { AbstractInterruptComponent } from '../types'
import { XpAgentInterruptSelectComponent } from './select/select.component'
import { XpAgentInterruptHitlComponent } from './hitl/hitl.component'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe],
  selector: 'xp-xpert-agent-interrupt',
  templateUrl: 'interrupt.component.html',
  styleUrls: ['interrupt.component.scss']
})
export class XpertAgentInterruptComponent {
  readonly #cdr = inject(ChangeDetectorRef)

  // Inputs
  readonly projectId = input<string>()
  readonly conversationId = input<string>()
  readonly interrupt = input<TSensitiveOperation['tasks'][number]['interrupts'][number]>()

  // Outputs
  readonly value = model<any>()

  // Children
  readonly container = viewChild('container', { read: ViewContainerRef })

  // States
  readonly interruptValue = computed(() => this.interrupt()?.value)
  readonly message = computed(() => {
    const value = this.interruptValue()
    return isInterruptMessage(value) ? value as TInterruptMessage : null
  })

  private componentRef!: ComponentRef<AbstractInterruptComponent>

  constructor() {
    effect(() => {
        const message = this.interruptValue() as TInterruptMessage
        if (message) {
          this.loadComponent(message).catch((error) => {
            console.error('Error loading component:', error)
          })
        }
      },
      { allowSignalWrites: true }
    )
  }

  async loadComponent(message: TInterruptMessage) {
    const component: Type<AbstractInterruptComponent> = await importComponent(message.type)
    if (!component) return

    this.container().clear()

    this.componentRef = this.container().createComponent(component)

    this.componentRef.instance.value.subscribe((value: any) => {
      this.value.set(value)
    })
    this.componentRef.instance.projectId.set(this.projectId())
    this.componentRef.instance.conversationId.set(this.conversationId())
    this.componentRef.instance.message.set(message)

    this.#cdr.detectChanges()
  }

}

async function importComponent(type: BIInterruptMessageType | InterruptMessageType | string) {
  switch (type) {
    case InterruptMessageType.Select:
      return XpAgentInterruptSelectComponent
    case BIInterruptMessageType.SwitchProject: {
      const { ProjectInterruptSwitchComponent } = await import('../../project/index')
      return ProjectInterruptSwitchComponent
    }
    case BIInterruptMessageType.SwitchSemanticModel: {
      const { InitModelComponent } = await import('../../model/index')
      return InitModelComponent
    }
    case InterruptMessageType.SlidesTemplate: {
      const { InterruptSlideComponent } = await import('../../files/interrupt-slide/interrupt-slide.component')
      return InterruptSlideComponent
    }
    case InterruptMessageType.SwitchGitHubRepository: {
      const { ProjectSwitchRepositoryComponent } = await import('../../xp-project/index')
      return ProjectSwitchRepositoryComponent
    }
    default:
      return XpAgentInterruptHitlComponent
  }
  return null
}