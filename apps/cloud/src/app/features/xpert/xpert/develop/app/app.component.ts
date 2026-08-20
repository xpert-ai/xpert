import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { TChatApp, TEnterpriseH5Platform } from '@xpert-ai/contracts'
import { ENTERPRISE_H5_PLATFORM_DEFINITIONS } from '@cloud/app/@core'
import { SlideUpAnimation } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardButtonComponent,
    ZardSwitchComponent,
    IntegrationSelectComponent
  ],
  selector: 'xpert-develop-app',
  templateUrl: './app.component.html',
  styleUrl: 'app.component.scss',
  animations: [SlideUpAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertDevelopAppComponent {
  readonly #data = inject<{ app: TChatApp }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly app = model(this.#data.app)
  readonly enterpriseH5Platforms = ENTERPRISE_H5_PLATFORM_DEFINITIONS

  get public() {
    return this.app()?.public
  }
  set public(value) {
    this.app.update((state) => ({ ...(state ?? {}), public: value }))
  }

  isEnterpriseH5Enabled(platform: TEnterpriseH5Platform) {
    return this.app()?.channels?.[platform]?.enabled ?? false
  }

  setEnterpriseH5Enabled(platform: TEnterpriseH5Platform, value: boolean) {
    this.app.update((state) => ({
      ...(state ?? {}),
      channels: {
        ...(state?.channels ?? {}),
        [platform]: {
          ...(state?.channels?.[platform] ?? {}),
          enabled: value
        }
      }
    }))
  }

  getEnterpriseH5IntegrationId(platform: TEnterpriseH5Platform) {
    return this.app()?.channels?.[platform]?.integrationId ?? null
  }

  setEnterpriseH5IntegrationId(platform: TEnterpriseH5Platform, value: string | null) {
    this.app.update((state) => ({
      ...(state ?? {}),
      channels: {
        ...(state?.channels ?? {}),
        [platform]: {
          ...(state?.channels?.[platform] ?? {}),
          integrationId: value?.trim() || undefined
        }
      }
    }))
  }

  readonly canApply = () =>
    this.enterpriseH5Platforms.every(
      ({ platform }) => !this.isEnterpriseH5Enabled(platform) || !!this.getEnterpriseH5IntegrationId(platform)
    )

  close() {
    this.#dialogRef.close()
  }

  apply() {
    if (this.canApply()) {
      this.#dialogRef.close(this.app())
    }
  }
}
