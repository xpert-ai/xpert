import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Store } from '../../../@core'
import { HeaderUserComponent } from '../../../@theme/header/user/user.component'

@Component({
  selector: 'xp-workbench-account',
  imports: [HeaderUserComponent],
  template: `
    @if (user(); as currentUser) {
      <xp-header-user [user]="currentUser" [compact]="true" menuPlacement="header" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkbenchAccountComponent {
  readonly user = toSignal(inject(Store).user$)
}
