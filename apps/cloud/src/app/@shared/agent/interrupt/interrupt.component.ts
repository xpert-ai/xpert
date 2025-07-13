import { CommonModule } from '@angular/common'
import { Component, ComponentRef, computed, input, model, viewChild, ViewContainerRef } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { TInterruptMessage, TSensitiveOperation } from '../../../@core'

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
  // Inputs
  readonly interrupt = input<TSensitiveOperation['tasks'][0]['interrupts'][0]>()

  // Outputs
  readonly value = model<any>()

  // Children
  readonly container = viewChild('container', { read: ViewContainerRef })

  // States
  readonly message = computed(() => this.interrupt()?.value)

  readonly instance = derivedAsync(() => this.message() ? this.loadComponent(this.message()) : null)

  private componentRef!: ComponentRef<any>

  async loadComponent(message: TInterruptMessage) {
    const HelloComponent = (await import('../../model/index')).InitModelComponent

    this.container().clear()

    this.componentRef = this.container().createComponent(HelloComponent)

    this.componentRef.instance.message.set(message)

    this.componentRef.instance.value.subscribe((value: any) => {
      this.value.set(value)
    })
  }
}
