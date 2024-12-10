import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormControl, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  OrganizationDemoNetworkEnum,
  OrganizationsService,
  ToastrService,
  getErrorMessage
} from 'apps/cloud/src/app/@core'
import { Subscription } from 'rxjs'
import { EditOrganizationComponent } from '../edit-organization/edit-organization.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'

@Component({
  standalone: true,
  selector: 'pac-organization-demo',
  templateUrl: './organization-demo.component.html',
  styleUrls: ['./organization-demo.component.scss'],
  imports: [CommonModule, SharedModule, MaterialModule, TranslateModule]
})
export class OrganizationDemoComponent extends TranslationBaseComponent {
  OrganizationDemoNetworkEnum = OrganizationDemoNetworkEnum

  readonly editOrganizationComponent = inject(EditOrganizationComponent)
  readonly orgsService = inject(OrganizationsService)
  readonly _toastrService = inject(ToastrService)

  source = new FormControl(OrganizationDemoNetworkEnum.github)
  fileUrl = new FormControl('', [Validators.required])

  readonly organization$ = this.editOrganizationComponent.organization
  readonly loading = signal(false)
  readonly generated = signal(false)

  #genSub: Subscription = null

  /**
   * Generate or regenerate demo data for current organization
   */
  generate() {
    this.loading.set(true)
    this.#genSub = this.orgsService.demo(this.organization$().id, {
      source: this.source.value ?? this.fileUrl.value,
      importData: true
    }).subscribe({
      next: () => {
        this._toastrService.success('PAC.NOTES.ORGANIZATIONS.DEMO_GENERATED', { Default: 'Demo generated' })
        this.loading.set(false)
        this.generated.set(true)
      },
      error: (err) => {
        this._toastrService.error(getErrorMessage(err))
        this.loading.set(false)
      }
    })
  }

  cancel() {
    this.#genSub?.unsubscribe()
    this.loading.set(false)
  }
}
