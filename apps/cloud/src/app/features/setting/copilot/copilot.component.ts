import { AsyncPipe } from '@angular/common'
import { Component, inject } from '@angular/core'
import { RouterModule } from '@angular/router'
import { injectOrganization } from '@metad/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService, routeAnimations } from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { MaterialModule } from '../../../@shared/material.module'

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
  readonly organization = injectOrganization()
}
