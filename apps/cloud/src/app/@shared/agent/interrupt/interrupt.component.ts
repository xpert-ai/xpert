import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, ComponentRef, computed, effect, inject, input, model, viewChild, ViewContainerRef } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { TInterruptMessage, TSensitiveOperation } from '../../../@core'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  selector: 'xpert-agent-interrupt',
  templateUrl: 'interrupt.component.html',
  styleUrls: ['interrupt.component.scss'],
})
export class XpertAgentInterruptComponent {
  readonly #cdr = inject(ChangeDetectorRef)

  // Inputs
  readonly interrupt = input<TSensitiveOperation['tasks'][0]['interrupts'][0]>()

  // Outputs
  readonly value = model<any>()

  // Children
  readonly container = viewChild('container', { read: ViewContainerRef })

  // States
  readonly message = computed(() => this.interrupt()?.value)

  // readonly instance = derivedAsync(() => this.message() ? this.loadComponent(this.message()) : null)

  private componentRef!: ComponentRef<any>

  constructor() {
    effect(() => {
      const message = this.message()
      if (message) {
        this.loadComponent(message).catch((error) => {
          console.error('Error loading component:', error)
        })
      }
    }, { allowSignalWrites: true})
  }

  async loadComponent(message: TInterruptMessage) {
    const InitModelComponent = (await import('../../model/index')).InitModelComponent

    this.container().clear()

    this.componentRef = this.container().createComponent(InitModelComponent)

    this.componentRef.instance.value.subscribe((value: any) => {
      this.value.set(value)
    })
    this.componentRef.instance.message.set(message)

    this.#cdr.detectChanges()
  }
}
