import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardCardImports } from '@xpert-ai/headless-ui'
import { ChatScheduledTaskSummaryCardComponent, XpertTaskDialogService } from '../../../@shared/chat'
import { ChatTasksComponent } from '../tasks/tasks.component'
import { ClawXpertFacade } from './clawxpert.facade'

@Component({
  standalone: true,
  selector: 'pac-clawxpert-scheduled-tasks',
  imports: [CommonModule, TranslateModule, ChatScheduledTaskSummaryCardComponent, ChatTasksComponent, ...ZardCardImports],
  template: `
    @if (!expanded()) {
      <xpert-scheduled-task-summary-card
        [tasks]="facade.scheduledTasks()"
        [count]="facade.scheduledTaskCount()"
        (create)="newTask()"
        (action)="expand()"
      />
    } @else {
      <z-card class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border shadow-none">
        <z-card-content class="flex min-h-0 flex-1 flex-col p-0">
          <div class="flex items-center justify-between gap-3 border-b border-divider-regular px-5 py-4">
            <div class="text-lg font-semibold text-text-primary">
              {{
                'PAC.Chat.ClawXpert.ScheduledTasksHeading'
                  | translate
                    : {
                        Default: 'Scheduled tasks({{count}})',
                        count: facade.scheduledTaskCount()
                      }
              }}
            </div>

            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
              (click)="collapse()"
            >
              {{ 'PAC.Chat.ClawXpert.CollapseTasks' | translate: { Default: 'Collapse' } }}
              <i class="ri-arrow-up-s-line text-lg"></i>
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-hidden px-5 py-4">
            <pac-chat-tasks
              class="block h-full min-h-[32rem]"
              [embedded]="true"
              [xpertId]="facade.xpertId()"
              (tasksChanged)="facade.refreshTaskSummaries()"
            />
          </div>
        </z-card-content>
      </z-card>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClawXpertScheduledTasksComponent {
  readonly facade = inject(ClawXpertFacade)
  readonly #taskDialog = inject(XpertTaskDialogService)
  readonly expanded = signal(false)

  constructor() {
    effect(() => {
      this.facade.xpertId()
      this.expanded.set(false)
    })
  }

  expand() {
    this.facade.refreshTaskSummaries()
    this.expanded.set(true)
  }

  collapse() {
    this.expanded.set(false)
  }

  newTask() {
    this.#taskDialog
      .openCreateTask({
        total: this.facade.scheduledTaskCount(),
        xpertId: this.facade.xpertId(),
        lockXpertSelection: true
      })
      .closed.subscribe({
        next: (task) => {
          if (task?.id) {
            this.facade.refreshTaskSummaries()
            this.expanded.set(true)
          }
        }
      })
  }
}
