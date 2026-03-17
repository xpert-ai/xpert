import { CdkListboxModule } from '@angular/cdk/listbox'

import { booleanAttribute, Component, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgebase } from '../../../@core/types'
import { EmojiAvatarComponent } from '../../avatar'
import { SharedUiModule } from '../../ui.module'

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
  selector: 'pac-knowledgebase-list',
  templateUrl: 'list.component.html',
  styleUrls: ['list.component.scss']
})
export class KnowledgebaseListComponent {
  readonly knowledgebaseList = input<IKnowledgebase[]>()
  readonly disabled = input<boolean, string | boolean>(false, { transform: booleanAttribute })
  readonly knowledgebases = model()

  compareId(a: IKnowledgebase, b: IKnowledgebase): boolean {
    return a?.id === b?.id
  }
}
