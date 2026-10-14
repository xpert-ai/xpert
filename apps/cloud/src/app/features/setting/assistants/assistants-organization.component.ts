import { ChangeDetectionStrategy, Component } from '@angular/core'
import { AssistantBindingScope } from '../../../@core'
import { AssistantsScopeComponent } from './assistants-scope.component'

@Component({
  standalone: true,
  selector: 'xp-settings-assistants-organization-page',
  imports: [AssistantsScopeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
  template: `<xp-settings-assistants-scope [scope]="assistantBindingScope.ORGANIZATION" />`
})
export class AssistantsOrganizationPageComponent {
  readonly assistantBindingScope = AssistantBindingScope
}
