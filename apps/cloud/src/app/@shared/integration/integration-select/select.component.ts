import { Component, computed, effect, inject, input, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectIntegrationAPI } from '@cloud/app/@core'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { map } from 'rxjs/operators'
import { IIntegration, IntegrationFeatureEnum, OrderTypeEnum, TSelectOption } from '../../../@core/types'
import { IconComponent } from '../../avatar'
import { XpSelectComponent } from '../../common'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, XpSelectComponent, IconComponent, XpI18nPipe],
  selector: 'xp-integration-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class IntegrationSelectComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)

  readonly integrationAPI = injectIntegrationAPI()

  // Inputs
  readonly integrationList = model<IIntegration[]>()
  readonly provider = input<string | null>(null)
  readonly placeholder = input<string | null>(null)
  readonly features = input<IntegrationFeatureEnum[] | null>(null)
  readonly enterpriseH5Platform = input<string | null>(null)

  // States
  readonly #providers = toSignal(this.integrationAPI.getProviders(), { initialValue: [] })
  readonly selectOptions = computed(() => {
    const items: TSelectOption<string>[] =
      this.integrations()?.map((integration) => {
        const provider = this.#providers().find((p) => p.name === integration.provider)
        return {
          value: integration.id,
          label: integration.name || provider?.label,
          description: integration.description || provider?.description,
          _icon: provider?.icon
        }
      }) ?? []
    // Make sure the current value is in the list, otherwise the listbox will broken
    if (this.integrationId() && !this.integrations()?.some((_) => _.id === this.integrationId())) {
      items.push({
        value: this.integrationId()
      })
    }
    return items
  })

  readonly integrationId = this.cva.value$

  readonly integrations = derivedAsync(() => {
    const where = {}
    const providers = this.#providers()
    if (this.provider()) {
      Object.assign(where, { provider: this.provider() })
    }
    if (this.features()?.length) {
      Object.assign(where, { features: { $contains: this.features() } })
    }
    return this.integrationAPI.getAllInOrg({ where, order: { createdAt: OrderTypeEnum.DESC } }).pipe(
      map(({ items }) => {
        const enterpriseH5Platform = this.enterpriseH5Platform()
        return items.filter((item) => {
          if (enterpriseH5Platform) {
            const provider = providers.find((candidate) => candidate.name === item.provider)
            return provider?.enterpriseH5?.platform === enterpriseH5Platform
          }
          return true
        })
      })
    )
  })

  readonly integration = computed(() => {
    return this.integrations()?.find((integration) => integration.id === this.integrationId())
  })
  readonly integrationProvider = computed(() => {
    return this.#providers().find((provider) => provider.name === this.integration()?.provider)
  })

  constructor() {
    effect(() => {
      if (this.integrations()) {
        this.integrationList.set(this.integrations())
      }
    })
  }

  openIntegrations() {
    window.open(`/settings/integration/create${this.provider() ? `?provider=${this.provider()}` : ''}`, '_blank')
  }
}
