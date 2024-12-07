import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store, ToastrService, routeAnimations } from '../../../@core'
import { AsyncPipe } from '@angular/common'
import { MaterialModule } from '../../../@shared/material.module'
import { TranslationBaseComponent } from '../../../@shared/language'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot',
  templateUrl: './copilot.component.html',
  styleUrls: ['./copilot.component.scss'],
  imports: [AsyncPipe, RouterModule, TranslateModule, MaterialModule],
  animations: [routeAnimations]
})
export class CopilotComponent extends TranslationBaseComponent {
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)

  readonly organizationId$ = this.#store.selectOrganizationId()
}
