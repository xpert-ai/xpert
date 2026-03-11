import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IIntegration, INTEGRATION_PROVIDERS } from '../../../@core/types'
import { EmojiAvatarComponent } from '../../avatar'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    TranslateModule,
    ZardIconComponent,
    EmojiAvatarComponent
  ],
  selector: 'pac-integration-list',
  templateUrl: 'list.component.html',
  styleUrls: ['list.component.scss']
})
export class IntegrationListComponent {
  readonly integrationList = input<IIntegration[]>()

  readonly integrations = model()

  compareId(a: IIntegration, b: IIntegration): boolean {
    return a?.id === b?.id
  }

  getProvider(integration?: IIntegration) {
    return INTEGRATION_PROVIDERS[integration.name]
  }
}
