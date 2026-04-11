import { CdkListboxModule } from '@angular/cdk/listbox'

import { booleanAttribute, Component, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertToolset } from '../../../@core/types'
import { SharedUiModule } from '../../ui.module'
import { EmojiAvatarComponent } from '../../avatar'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    SharedUiModule,
    CdkListboxModule,
    TranslateModule,
    EmojiAvatarComponent
],
  selector: 'pac-toolset-list',
  templateUrl: 'list.component.html',
  styleUrls: ['list.component.scss']
})
export class ToolsetListComponent {
  readonly toolsetList = input<IXpertToolset[]>()
  readonly disabled = input<boolean, string | boolean>(false, { transform: booleanAttribute })

  readonly toolsets = model()

  compareId(a: IXpertToolset, b: IXpertToolset): boolean {
    return a?.id === b?.id
  }
}
