import { ChangeDetectionStrategy, Component } from '@angular/core'
import { AssistantBindingScope } from '../../../@core'
import { AssistantsScopeComponent } from './assistants-scope.component'

@Component({
  standalone: true,
  selector: 'xp-settings-assistants-tenant-page',
  imports: [AssistantsScopeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
  template: `<xp-settings-assistants-scope [scope]="assistantBindingScope.TENANT" />`
})
export class AssistantsTenantPageComponent {
  readonly assistantBindingScope = AssistantBindingScope
}
