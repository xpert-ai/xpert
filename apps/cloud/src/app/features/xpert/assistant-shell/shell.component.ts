import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterModule } from '@angular/router'
import { XpertAssistantFacade } from './assistant.facade'
import { XpertSharedAssistantComponent } from './shared-assistant.component'

@Component({
  standalone: true,
  selector: 'xp-assistant-shell',
  imports: [RouterModule, XpertSharedAssistantComponent],
  template: `
    <router-outlet />
    <xp-shared-assistant />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [XpertAssistantFacade],
  styles: `
    :host {
      @apply flex h-full w-full;
    }
  `
})
export class XpertAssistantShellComponent {}
