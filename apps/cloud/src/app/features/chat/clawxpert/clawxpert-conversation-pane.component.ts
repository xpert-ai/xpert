import { ChangeDetectionStrategy, Component, inject, Injectable, input } from '@angular/core'
import type { ClawXpertConversationScope } from '@xpert-ai/contracts'
import {
  ViewClientCommandRegistry,
  ViewClientCommandHandler,
  ViewClientCommandContext
} from '../../../@shared/view-extension/view-client-command-registry.service'
import { WORKBENCH_CHAT_FACADE } from '../workbench-chat/workbench-chat.facade'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import { CLAWXPERT_CONVERSATION_SCOPE } from './clawxpert-conversation-scope'
import { ClawXpertScopedConversationFacade } from './clawxpert-scoped-conversation.facade'
import { ClawXpertSkillTrialIntentService } from './clawxpert-skill-trial-intent.service'
import {
  ClawXpertWorkbenchViewUrlState,
  CLAWXPERT_WORKBENCH_ROUTE_ACTIVE
} from './clawxpert-workbench-view-url-state.service'

@Injectable()
class ScopedConversationCommands extends ViewClientCommandRegistry {
  private readonly parent = inject(ViewClientCommandRegistry, { skipSelf: true })
  private readonly facade = inject(ClawXpertScopedConversationFacade)
  override register(key: string, handler: ViewClientCommandHandler) {
    return this.parent.register(key, handler, () => this.facade.isCurrentRoute())
  }
  override execute(key: string, payload: unknown, context: ViewClientCommandContext) {
    return this.parent.execute(key, payload, context)
  }
}

@Injectable()
class ScopedSkillTrialIntent extends ClawXpertSkillTrialIntentService {
  private readonly parent = inject(ClawXpertSkillTrialIntentService, { skipSelf: true })
  private readonly facade = inject(ClawXpertScopedConversationFacade)
  override peek() {
    return this.facade.active() && this.facade.scope() === 'task' ? this.parent.peek() : null
  }
  override consume() {
    return this.peek() ? this.parent.consume() : null
  }
  override set(intent: Parameters<ClawXpertSkillTrialIntentService['set']>[0]) {
    this.parent.set(intent)
  }
  override clear() {
    this.parent.clear()
  }
}

@Component({
  standalone: true,
  selector: 'xp-clawxpert-conversation-pane',
  imports: [ClawXpertConversationDetailComponent],
  providers: [
    { provide: CLAWXPERT_CONVERSATION_SCOPE, useFactory: () => inject(ClawXpertConversationPaneComponent).scope },
    ClawXpertScopedConversationFacade,
    { provide: WORKBENCH_CHAT_FACADE, useExisting: ClawXpertScopedConversationFacade },
    { provide: ViewClientCommandRegistry, useClass: ScopedConversationCommands },
    { provide: ClawXpertSkillTrialIntentService, useClass: ScopedSkillTrialIntent },
    {
      provide: CLAWXPERT_WORKBENCH_ROUTE_ACTIVE,
      useFactory: () => {
        const facade = inject(ClawXpertScopedConversationFacade)
        return () => facade.isCurrentRoute()
      }
    },
    ClawXpertWorkbenchViewUrlState
  ],
  template: '<xp-clawxpert-conversation-detail />',
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClawXpertConversationPaneComponent {
  readonly scope = input.required<ClawXpertConversationScope>()
}

/** The parent shell owns the mounted chat panes so route switches retain composer state. */
@Component({ standalone: true, template: '' })
export class ClawXpertConversationRouteComponent {}
