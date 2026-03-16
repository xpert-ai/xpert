
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ZardDividerComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store, routeAnimations } from '../../../@core'
import { UserPipe } from '../../../@shared/pipes'
import { UserAvatarEditorComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  selector: 'pac-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...ZardTabsImports,
    ZardDividerComponent,
    TranslateModule,
    RouterModule,
    UserPipe,
    UserAvatarEditorComponent
]
})
export class PACAccountComponent {
  private readonly store = inject(Store)

  public readonly user = toSignal(this.store.user$)
}
