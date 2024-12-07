import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store, ToastrService, routeAnimations } from '../../../@core'
import { AsyncPipe } from '@angular/common'
import { TranslationBaseComponent } from '../../../@shared/language'
import { MaterialModule } from '../../../@shared/material.module'

@Component({
  standalone: true,
  selector: 'pac-settings-xpert',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [AsyncPipe, RouterModule, TranslateModule, MaterialModule],
  animations: [routeAnimations]
})
export class XpertHomeComponent extends TranslationBaseComponent {
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)

  readonly organizationId$ = this.#store.selectOrganizationId()
}
