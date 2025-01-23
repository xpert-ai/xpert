import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSidenav } from '@angular/material/sidenav'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ChatNewChatComponent, ChatSideMenuComponent } from '../icons'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmCommonModule,
    ChatSideMenuComponent,
    ChatNewChatComponent
  ],
  selector: 'pac-chat-sidenav-menu',
  templateUrl: './sidenav-menu.component.html',
  styleUrl: 'sidenav-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatSidenavMenuComponent {
  readonly #router = inject(Router)

  readonly sidenav = input<MatSidenav>()

  async newConversation() {
    this.#router.navigate(['/chat/x/common'])
  }
}
