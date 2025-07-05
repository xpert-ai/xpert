import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { IKnowledgebase, KnowledgebaseTypeEnum } from '@cloud/app/@core/types'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { startWith } from 'rxjs/operators'
import { EmojiAvatarComponent } from '../../avatar'
import { UserPipe } from '../../pipes'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmHighlightDirective, EmojiAvatarComponent, UserPipe],
  selector: 'knowledgebase-card',
  templateUrl: `card.component.html`,
  styleUrl: `card.component.scss`
})
export class KnowledgebaseCardComponent {
  eKnowledgebaseTypeEnum = KnowledgebaseTypeEnum

  readonly knowledgebase = input<IKnowledgebase>()

  readonly formControl = new FormControl()
  readonly searchText = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
}
