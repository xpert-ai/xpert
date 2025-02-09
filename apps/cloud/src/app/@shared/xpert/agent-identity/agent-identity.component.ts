import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { agentLabel, IXpertAgent } from '../../../@core/types'
import { EmojiAvatarComponent } from '../../avatar'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, EmojiAvatarComponent],
  selector: 'xpert-agent-identity',
  templateUrl: 'agent-identity.component.html',
  styleUrls: ['agent-identity.component.scss']
})
export class XpertAgentIdentityComponent {
  
  // Inputs
  readonly agent = input<Partial<IXpertAgent>>()

  // States
  readonly avatar = computed(() => this.agent()?.avatar)
  readonly agentLabel = computed(() => agentLabel(this.agent()))
  readonly description = computed(() => this.agent()?.description)
}
