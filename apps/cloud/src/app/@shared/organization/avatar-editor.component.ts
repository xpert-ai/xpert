import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, inject, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { IOrganization, OrganizationsService, StorageFileService, Store } from '../../@core'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-org-avatar-editor',
  templateUrl: './avatar-editor.component.html',
  styles: [``],
  imports: [ZardIconComponent, CdkMenuModule, TranslateModule]
})
export class OrgAvatarEditorComponent {
  private readonly storageFileService = inject(StorageFileService)
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
    return await firstValueFrom(this.storageFileService.uploadStorageFile(fileUpload))
  }

  async remove() {
    this.orgService.update(this.org().id, { imageUrl: null }).subscribe((org) => {
      this.#store.selectedOrganization = org
    })
  }
}
