import { Component, inject, OnDestroy } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { firstValueFrom, map } from 'rxjs'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { ChatConversationService, XpertProjectService } from '@cloud/app/@core'
import { ExtensionHostOutletComponent } from '@cloud/app/@shared/view-extension/extension-host-outlet.component'
import { ViewClientCommandRegistry } from '@cloud/app/@shared/view-extension/view-client-command-registry.service'
import { registerWorkbenchNavigationOpenCommand } from '../assistant/workbench-navigation-open-client-command'
import { XpertProjectConversationDialogComponent } from './project-conversation-dialog.component'

@Component({
  standalone: true,
  selector: 'xp-project-task-management',
  imports: [ExtensionHostOutletComponent],
  host: { class: 'block h-full min-h-0' },
  template: `<xp-extension-host-outlet
    hostType="project"
    [hostId]="projectId()"
    slot="task.management"
    viewKey="platform.project-tasks__timeline"
    [fillAvailableHeight]="true"
    mode="single-view"
  />`
})
export class XpertProjectTaskManagementComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute).parent!
  readonly projectId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id')!)), {
    initialValue: this.route.snapshot.paramMap.get('id')!
  })
  private destroyed = false
  readonly projects = inject(XpertProjectService)
  readonly conversations = inject(ChatConversationService)
  readonly dialog = inject(ZardDialogService)
  readonly unregister = registerWorkbenchNavigationOpenCommand(inject(ViewClientCommandRegistry), {
    openAssistantConversation: async (target) => {
      const projectId = this.projectId()
      if (target.projectId !== projectId) throw Error('PROJECT_TASK_CONTEXT_REQUIRED')
      const conversation = await firstValueFrom(
        this.conversations.getOneById(target.conversationId, { relations: ['xpert'] })
      )
      if (this.destroyed || projectId !== this.projectId() || conversation.projectId !== projectId) {
        throw Error('PROJECT_TASK_CONTEXT_CHANGED')
      }
      this.dialog.open(XpertProjectConversationDialogComponent, {
        data: {
          projectId,
          conversation: { ...conversation, threadId: target.threadId ?? conversation.threadId },
          executionId: target.executionId
        },
        width: 'min(96vw, 1200px)',
        maxWidth: 'calc(100vw - 24px)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      })
    }
  })
  ngOnDestroy() {
    this.destroyed = true
    this.unregister()
  }
}
