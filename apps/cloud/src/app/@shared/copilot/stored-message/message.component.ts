import { Clipboard } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, signal } from '@angular/core'
import { StoredMessage } from '@langchain/core/messages'
import { effectAction } from '@metad/ocap-angular/core'
import { MarkdownModule } from 'ngx-markdown'
import { timer } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import { CopilotMessageContentComponent } from '../message-content/content.component'
import { CopilotMessageToolCallComponent } from '../tool-call/tool-call.component'

@Component({
  standalone: true,
  imports: [CommonModule, MarkdownModule, CopilotMessageContentComponent, CopilotMessageToolCallComponent],
  selector: 'copilot-stored-message',
  templateUrl: 'message.component.html',
  styleUrls: ['message.component.scss']
})
export class CopilotStoredMessageComponent {
  readonly #clipboard = inject(Clipboard)

  // Inputs
  readonly message = input<StoredMessage>()

  // States
  readonly content = computed(() => this.message()?.data.content)

  readonly toolCalls = computed(() => (<any>this.message()?.data).tool_calls)

  readonly toolMessage = computed(() => this.message()?.data)
  readonly toolResponse = computed(() => {
    const content = this.toolMessage()?.content
    return content
  })

  readonly copied = signal(false)

  copy = effectAction((origin$) =>
    origin$.pipe(
      tap(() => {
        const text = this.content()
          ? typeof this.content() === 'string'
            ? this.content()
            : JSON.stringify(this.content())
          : this.toolCalls()
            ? JSON.stringify(this.toolCalls())
            : this.toolResponse()
        this.#clipboard.copy(text)
        this.copied.set(true)
      }),
      switchMap(() => timer(3000)),
      tap(() => this.copied.set(false))
    )
  )
}
