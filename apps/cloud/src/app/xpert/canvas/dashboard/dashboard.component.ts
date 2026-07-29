import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertHomeService } from '@cloud/app/xpert/'
import { TMessageComponent, TMessageContentComponent } from '@cloud/app/@core'
import { ChatMessageDashboardComponent } from '../../ai-message/dashboard/dashboard.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [TranslateModule, ...ZardTooltipImports, ChatMessageDashboardComponent],
  selector: 'chat-canvas-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: 'dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.expand]': 'expand()'
  }
})
export class ChatCanvasDashboardComponent {
  readonly homeService = inject(XpertHomeService)

  // Inputs
  readonly componentId = input<string>()

  // States
  readonly expand = signal(false)

  /**
   * @deprecated Use `componentId` to locate step message
   */
  readonly messageId = computed(
    () => this.homeService.canvasOpened()?.type === 'Dashboard' && this.homeService.canvasOpened()?.messageId
  )

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
            (content) => content.type === 'component' && (<TMessageComponent>content.data)?.category === 'Dashboard'
          ) as TMessageContentComponent[])
        )
      }
      return acc
    }, [])

    return contents
  })

  readonly contents = computed(() => {
    return this._contents().filter((_) => (this.componentId() ? _.id === this.componentId() : true))
  })

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  close() {
    this.homeService.canvasOpened.set({ opened: false, type: 'Dashboard' })
  }
}
