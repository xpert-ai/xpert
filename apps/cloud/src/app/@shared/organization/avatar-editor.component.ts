import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, inject, input } from '@angular/core'
import { AppearanceDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { IOrganization, OrganizationsService, ScreenshotService, Store } from '../../@core'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-org-avatar-editor',
  templateUrl: './avatar-editor.component.html',
  styles: [``],
  imports: [
    ZardIconComponent,
    CdkMenuModule,
    TranslateModule,
    DensityDirective,
    AppearanceDirective
]
})
export class OrgAvatarEditorComponent {
  private readonly screenshotService = inject(ScreenshotService)
  private readonly orgService = inject(OrganizationsService)
  readonly #store = inject(Store)

  readonly org = input<IOrganization>()

  async uploadAvatar(event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    const screenshot = await this.uploadScreenshot(file)
    const org = await firstValueFrom(this.orgService.update(this.org().id, { imageUrl: screenshot.url }))
    this.#store.selectedOrganization = org
  }

  async uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return await firstValueFrom(this.screenshotService.create(formData))
  }

  async remove() {
    this.orgService.update(this.org().id, { imageUrl: null }).subscribe((org) => {
      this.#store.selectedOrganization = org
    })
  }
}
