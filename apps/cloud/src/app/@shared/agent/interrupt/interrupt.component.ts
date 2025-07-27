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
import { TranslateModule } from '@ngx-translate/core'
import {
  BIInterruptMessageType,
  SandboxInterruptMessageType,
  TInterruptMessage,
  TSensitiveOperation
} from '../../../@core'
import { AbstractInterruptComponent } from '../types'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  selector: 'xpert-agent-interrupt',
  templateUrl: 'interrupt.component.html',
  styleUrls: ['interrupt.component.scss']
})
export class XpertAgentInterruptComponent {
  readonly #cdr = inject(ChangeDetectorRef)

  // Inputs
  readonly conversationId = input<string>()
  readonly interrupt = input<TSensitiveOperation['tasks'][number]['interrupts'][number]>()

  // Outputs
  readonly value = model<any>()

  // Children
  readonly container = viewChild('container', { read: ViewContainerRef })

  // States
  readonly message = computed(() => this.interrupt()?.value)

  private componentRef!: ComponentRef<AbstractInterruptComponent>

  constructor() {
    effect(
      () => {
        const message = this.message()
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
    let component: Type<AbstractInterruptComponent>
    if (message.type === BIInterruptMessageType.SwitchProject) {
      const { ProjectInterruptSwitchComponent } = await import('../../project/index')
      component = ProjectInterruptSwitchComponent
    } else if (message.type === BIInterruptMessageType.SwitchSemanticModel) {
      const { InitModelComponent } = await import('../../model/index')
      component = InitModelComponent
    } else if (message.type === SandboxInterruptMessageType.SlidesTemplate) {
      const { InterruptSlideComponent } = await import('../../files/interrupt-slide/interrupt-slide.component')
      component = InterruptSlideComponent
    }
    if (!component) return

    this.container().clear()

    this.componentRef = this.container().createComponent(component)

    this.componentRef.instance.value.subscribe((value: any) => {
      this.value.set(value)
    })
    this.componentRef.instance.conversationId.set(this.conversationId())
    this.componentRef.instance.message.set(message)

    this.#cdr.detectChanges()
  }
}
