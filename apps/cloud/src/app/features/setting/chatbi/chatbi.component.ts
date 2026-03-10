import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store, ToastrService, routeAnimations } from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { ZardTabsImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-settings-chatbi',
  templateUrl: './chatbi.component.html',
  styleUrls: ['./chatbi.component.scss'],
  imports: [RouterModule, TranslateModule, MatDividerModule, ...ZardTabsImports, MatIconModule],
  animations: [routeAnimations]
})
export class ChatBIComponent extends TranslationBaseComponent {
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)

  readonly organizationId$ = this.#store.selectOrganizationId()
}
