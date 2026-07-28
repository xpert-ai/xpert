import { Component, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { XpButtonGroupDirective } from '@xpert-ai/headless-ui'
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
    TranslateModule,
    XpButtonGroupDirective,
    EmojiAvatarComponent
  ],
  selector: 'xp-knowledgebase-card',
  templateUrl: 'knowledgebase.component.html',
  styleUrls: ['knowledgebase.component.scss']
})
export class KnowledgebaseCardComponent {
  readonly knowledgebase = model<IKnowledgebase>()
}
