import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { DataSettings } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatComponentMessageComponent } from 'apps/cloud/src/app/xpert/'
import {
  ChatMessageStepType,
  injectFormatRelative,
  TMessageComponent,
  TMessageContentComponent
} from '../../../../@core'
import { ChatHomeService } from '../../home.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
    ChatComponentMessageComponent
  ],
  selector: 'chat-canvas-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: 'dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.expand]': 'expand()'
  }
})
export class ChatCanvasDashboardComponent {
  eChatMessageStepType = ChatMessageStepType

  readonly homeService = inject(ChatHomeService)
  readonly #formatRelative = injectFormatRelative()

  // States
  readonly expand = signal(false)

  readonly messages = this.homeService.messages
  readonly messageId = computed(
    () => this.homeService.canvasOpened()?.type === 'Dashboard' && this.homeService.canvasOpened()?.messageId
  )
  readonly componentId = computed(
    () => this.homeService.canvasOpened()?.type === 'Dashboard' && this.homeService.canvasOpened()?.componentId
  )

  readonly #messages = computed(() => {
    const conversation = this.homeService.conversation()
    const id = this.messageId()
    if (conversation?.messages) {
      return id ? conversation.messages.filter((m) => m.id === id) : conversation.messages
    }
    return null
  })

  readonly contents = computed(() => {
    const messages = this.#messages()
    const contents = messages.reduce((acc, message) => {
      const contents = message.content
      if (Array.isArray(contents)) {
        acc.push(
          ...(contents.filter(
            (content) =>
              content.type === 'component' &&
              (<TMessageComponent>content.data)?.category === 'Dashboard' &&
              (this.componentId() ? content.id === this.componentId() : true)
          ) as TMessageContentComponent[])
        )
      }
      return acc
    }, [])

    return contents.slice(contents.length - 1)
  })

  readonly #componentData = computed(
    () => this.contents()?.[0]?.data as TMessageComponent<{ dataSettings: DataSettings }>
  )

  // Todo add more components in bi dashboard

  constructor() {
    effect(() => {
      // console.log(this.messageId(), this.message(), this.contents())
    })

    // Update to last component
    effect(
      () => {
        if (this.messages()) {
          this.homeService.canvasOpened.update((state) => ({ type: 'Dashboard' }))
        }
      },
      { allowSignalWrites: true }
    )
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  close() {
    this.homeService.canvasOpened.set(null)
  }
}
