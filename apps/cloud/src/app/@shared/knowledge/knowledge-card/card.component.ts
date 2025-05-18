import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { IKnowledgebase } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from '../../avatar'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { FormControl } from '@angular/forms'
import { toSignal } from '@angular/core/rxjs-interop'
import { startWith } from 'rxjs/operators'
import { UserPipe } from '../../pipes'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmHighlightDirective, EmojiAvatarComponent, UserPipe],
  selector: 'knowledgebase-card',
  templateUrl: `card.component.html`,
  styleUrl: `card.component.scss`
})
export class KnowledgebaseCardComponent {
  readonly knowledgebase = input<IKnowledgebase>()


  readonly formControl = new FormControl()
  readonly searchText = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
}
