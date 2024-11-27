import { Component, computed, effect, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { injectOrganizationId } from '@metad/cloud/state'
import { AiProviderRole } from '@metad/contracts'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectCopilots,
  injectCopilotServer,
  injectToastr,
  PACCopilotService
} from 'apps/cloud/src/app/@core'
import { CopilotProviderComponent, MaterialModule } from '../../../../@shared'
import { CopilotFormComponent } from '../copilot-form/copilot-form.component'
import { DisappearAnimations } from '@metad/core'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot-basic',
  templateUrl: './basic.component.html',
  styleUrls: ['./basic.component.scss'],
  imports: [
    TranslateModule,
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    NgmDensityDirective,
    CopilotProviderComponent,
    CopilotFormComponent
  ],
  animations: [
    ...DisappearAnimations
  ]
})
export class CopilotBasicComponent {
  eAiProviderRole = AiProviderRole
  readonly copilotService = inject(PACCopilotService)
  readonly copilotServer = injectCopilotServer()
  readonly copilots = injectCopilots()
  readonly #toastr = injectToastr()
  readonly organizationId = injectOrganizationId()

  readonly primary = computed(() =>
    this.copilots()?.find((_) => _.organizationId === this.organizationId() && _.role === AiProviderRole.Primary)
  )
  readonly secondary = computed(() =>
    this.copilots()?.find((_) => _.organizationId === this.organizationId() && _.role === AiProviderRole.Secondary)
  )
  readonly embedding = computed(() =>
    this.copilots()?.find((_) => _.organizationId === this.organizationId() && _.role === AiProviderRole.Embedding)
  )

  readonly quotaCopilots = computed(() => {
    return this.copilots()?.filter((item) => !item.organizationId && item.modelProvider)
  })

  constructor() {
    this.copilotServer.refresh()
    effect(() => {
      // console.log(this.quotaCopilots())
    })
  }

  onToggle(role: AiProviderRole, current: boolean) {
    ;(current ? this.copilotServer.disableCopilot(role) : this.copilotServer.enableCopilot(role)).subscribe({
      next: () => {
        this.copilotServer.refresh()
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
