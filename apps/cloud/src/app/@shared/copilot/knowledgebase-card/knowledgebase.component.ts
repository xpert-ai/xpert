
import { Component, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgebase } from '../../../@core/types'
import { EmojiAvatarComponent } from '../../avatar'
import { MaterialModule } from '../../material.module'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    ButtonGroupDirective,
    EmojiAvatarComponent
],
  selector: 'pac-knowledgebase-card',
  templateUrl: 'knowledgebase.component.html',
  styleUrls: ['knowledgebase.component.scss']
})
export class KnowledgebaseCardComponent {
  readonly knowledgebase = model<IKnowledgebase>()
}
