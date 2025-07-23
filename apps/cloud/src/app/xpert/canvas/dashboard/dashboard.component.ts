import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { XpertHomeService } from '@cloud/app/xpert/'
import {
  ChatDashboardMessageType,
  TMessageComponent,
  TMessageContentComponent
} from '@cloud/app/@core'
import { uniq } from 'lodash-es'
import { ModelCubeComponent, ModelMembersComponent, ModelVirtualCubeComponent } from '@cloud/app/@shared/model'
import { XpIndicatorFormComponent, XpListIndicatorsComponent } from '@cloud/app/@shared/indicator'
import { ChatMessageDashboardComponent } from '../../ai-message/dashboard/dashboard.component'

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
    ChatMessageDashboardComponent,
    ModelCubeComponent,
    ModelMembersComponent,
    ModelVirtualCubeComponent,
    XpListIndicatorsComponent,
    XpIndicatorFormComponent
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
  eChatDashboardMessageType = ChatDashboardMessageType

  readonly homeService = inject(XpertHomeService)

  // Inputs
  readonly componentId = input<string>()

  // States
  readonly expand = signal(false)

  readonly messages = this.homeService.messages
  /**
   * @deprecated Use `componentId` to locate step message
   */
  readonly messageId = computed(
    () => this.homeService.canvasOpened()?.type === 'Dashboard' && this.homeService.canvasOpened()?.messageId
  )

  readonly #messages = computed(() => {
    const conversation = this.homeService.conversation()
    const id = this.messageId()
    if (conversation?.messages) {
      return id ? conversation.messages.filter((m) => m.id === id) : conversation.messages
    }
    return null
  })

  readonly _contents = computed(() => {
    const messages = this.homeService.conversation()?.messages
    if (!messages?.length) {
      return []
    }
    const contents = messages.reduce((acc, message) => {
      const contents = message.content
      if (Array.isArray(contents)) {
        acc.push(
          ...(contents.filter(
            (content) =>
              content.type === 'component' &&
              (<TMessageComponent>content.data)?.category === 'Dashboard'
          ) as TMessageContentComponent[])
        )
      }
      return acc
    }, [])

    return contents
  })

  readonly contents = computed(() => {
    return this._contents().filter((_) => this.componentId() ? _.id === this.componentId() : true)
  })

  readonly types = computed(() => {
    return uniq(this._contents()?.map((content) => content.data.type) || [])
  })


  toggleExpand() {
    this.expand.update((state) => !state)
  }

  close() {
    this.homeService.canvasOpened.set({opened: false, type: 'Dashboard'})
  }
}
