import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, inject, OnDestroy } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { firstValueFrom, map } from 'rxjs'
import { ChatConversationService, Store, XpertProjectService } from '@cloud/app/@core'
import { ExtensionHostOutletComponent } from '@cloud/app/@shared/view-extension/extension-host-outlet.component'
import { ViewClientCommandRegistry } from '@cloud/app/@shared/view-extension/view-client-command-registry.service'
import { registerWorkbenchNavigationOpenCommand } from '../assistant/workbench-navigation-open-client-command'
import { XpertProjectExecutionResultDialogComponent } from './project-execution-result-dialog.component'
import { XpertProjectConversationDialogComponent } from './project-conversation-dialog.component'

@Component({
  standalone: true,
  selector: 'xp-project-task-management',
  imports: [ExtensionHostOutletComponent],
  host: { class: 'block h-full min-h-0' },
  template: `<xp-extension-host-outlet
    hostType="project"
    [hostId]="projectId()"
    [runtimeUserId]="runtimeUserId()"
    slot="task.management"
    viewKey="platform.project-tasks__timeline"
    [query]="entryQuery()"
    [fillAvailableHeight]="true"
    mode="single-view"
  />`
})
export class XpertProjectTaskManagementComponent implements OnDestroy {
  readonly runtimeUserId = toSignal(inject(Store).user$.pipe(map((user) => user?.id ?? null)), { initialValue: null })
  private readonly route = inject(ActivatedRoute).parent!
  private readonly router = inject(Router)
  private readonly entryRoute = inject(ActivatedRoute)
  private readonly focusQuery = toSignal(this.entryRoute.queryParamMap, {
    initialValue: this.entryRoute.snapshot.queryParamMap
  })
  readonly entryQuery = computed(() =>
    this.entryRoute.snapshot.data['pipelineManagement']
      ? {
          parameters: {
            initialTab: 'pipeline',
            ...Object.fromEntries(
              ['pipelineInstanceId', 'pipelineRoundId', 'pipelineNodeId'].flatMap((key) => {
                const value = this.focusQuery()?.get(key)
                return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
                  ? [[key, value]]
                  : []
              })
            )
          }
        }
      : null
  )
  readonly projectId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id')!)), {
    initialValue: this.route.snapshot.paramMap.get('id')!
  })
  private destroyed = false
  readonly projects = inject(XpertProjectService)
  readonly conversations = inject(ChatConversationService)
  readonly dialog = inject(Dialog)
  readonly unregister = registerWorkbenchNavigationOpenCommand(inject(ViewClientCommandRegistry), {
    navigate: (commands, options) => this.router.navigate(commands, options),
    openAssistantProject: (target) => {
      if (
        this.destroyed ||
        target.projectId !== this.projectId() ||
        !target.view ||
        !['platform.agent-results__results', 'platform.coding-execution__execution'].includes(target.view.viewKey) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.view.selectionId ?? '')
      )
        throw Error('PROJECT_TASK_CONTEXT_REQUIRED')
      this.dialog.open(XpertProjectExecutionResultDialogComponent, {
        data: { projectId: target.projectId, viewKey: target.view.viewKey, selectionId: target.view.selectionId },
        width: 'min(96vw, 1200px)',
        maxWidth: 'calc(100vw - 24px)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      })
    },
    openAssistantConversation: async (target) => {
      const projectId = this.projectId()
      const userId = this.runtimeUserId()
      if (target.projectId !== projectId) throw Error('PROJECT_TASK_CONTEXT_REQUIRED')
      const conversation = await firstValueFrom(
        this.conversations.getOneById(target.conversationId, { relations: ['xpert'] })
      )
      // A resolved conversation must still match the host identity and the exact requested execution context.
      if (
        this.destroyed ||
        userId !== this.runtimeUserId() ||
        projectId !== this.projectId() ||
        conversation.projectId !== projectId ||
        conversation.id !== target.conversationId ||
        (target.threadId && target.threadId !== conversation.threadId)
      ) {
        throw Error('PROJECT_TASK_CONTEXT_CHANGED')
      }
      this.dialog.open(XpertProjectConversationDialogComponent, {
        data: {
          projectId,
          conversation,
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
