import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from '../../../@shared/material.module'
import { AppService } from '../../../app.service'
import { ChatService } from '../chat.service'
import { map } from 'rxjs'
import { PACCopilotService } from '../../services'
import { uuid } from '../../../@core'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    MaterialModule,
    NgmCommonModule
  ],
  selector: 'pac-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrl: 'chat-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatInputComponent {
  readonly chatService = inject(ChatService)
  readonly appService = inject(AppService)
  readonly copilotService = inject(PACCopilotService)
  readonly #router = inject(Router)

  readonly promptControl = new FormControl<string>(null)
  readonly prompt = toSignal(this.promptControl.valueChanges)
  readonly answering = this.chatService.answering

  readonly disabled$ = this.copilotService.enabled$.pipe(map((enabled) => !enabled))

  constructor() {
    effect(() => {
      this.answering() ? this.promptControl.disable() : this.promptControl.enable()
    })
  }

  send() {
    this.ask(this.prompt().trim())
  }

  // askWebsocket() {
  //   const content = this.prompt().trim()
  //   const id = uuid()
  //   this.chatWebsocketService.appendMessage({
  //     id,
  //     role: 'user',
  //     content
  //   })
  //   this.chatWebsocketService.message(id, content)
  //   this.promptControl.setValue('')
  // }

  ask(content: string) {
    const id = uuid()
    // const content = this.prompt().trim()
    // this.answering.set(true)
    this.chatService.appendMessage({
      id,
      role: 'user',
      content
    })
    this.promptControl.setValue('')

    // Send message
    this.chatService.chat({id, content})
  }

  stopGenerating() {
    this.chatService.cancelMessage()
  }

  triggerFun(event: KeyboardEvent) {
    if ((event.isComposing || event.shiftKey) && event.key === 'Enter') {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const text = this.prompt()?.trim()
      if (text) {
        setTimeout(() => {
          this.ask(text)
        })
      }
      return
    }
  }

  navigateCopilot() {
    this.#router.navigate(['/settings/copilot'])
  }
}
