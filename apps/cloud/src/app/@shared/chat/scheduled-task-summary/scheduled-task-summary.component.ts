import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { DateRelativePipe, IXpertTask } from '../../../@core'

@Component({
  standalone: true,
  selector: 'xpert-scheduled-task-summary-card',
  imports: [CommonModule, TranslateModule, DateRelativePipe, ZardButtonComponent, ...ZardCardImports],
  template: `
    <z-card class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border shadow-none">
      <z-card-content class="flex min-h-0 flex-1 flex-col p-0">
        <div class="flex items-center justify-between gap-3 border-b border-divider-regular px-5 py-4">
          <div class="text-lg font-semibold text-text-primary">
            {{
              'PAC.Chat.ClawXpert.ScheduledTasksHeading'
                | translate
                  : {
                      Default: 'Scheduled tasks({{count}})',
                      count: count()
                    }
            }}
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <button z-button zType="default" displayDensity="cosy" type="button" (click)="create.emit()">
              <i class="ri-add-line text-base"></i>
              {{ 'PAC.Xpert.NewTask' | translate: { Default: 'New Task' } }}
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
              (click)="action.emit()"
            >
              {{ 'PAC.Chat.ClawXpert.ViewAllTasks' | translate: { Default: 'View all' } }}
              <i class="ri-arrow-right-s-line text-lg"></i>
            </button>
          </div>
        </div>

        @if (tasks().length) {
          <div class="flex min-h-0 flex-1 flex-col">
            @for (task of tasks(); track task.id) {
              <div class="flex items-start gap-3 border-b border-divider-regular px-5 py-4 last:border-b-0">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle text-text-secondary"
                >
                  <i class="ri-calendar-schedule-line text-lg"></i>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium text-text-primary">
                        {{ task.name || ('PAC.Chat.ClawXpert.UnnamedTask' | translate: { Default: 'Untitled task' }) }}
                      </div>
                      <div class="mt-1 truncate text-xs font-mono text-text-secondary">
                        {{
                          task.scheduleDescription ||
                            task.schedule ||
                            ('PAC.Chat.ClawXpert.SchedulePlaceholder' | translate: { Default: 'Schedule details coming soon' })
                        }}
                      </div>
                    </div>

                    <div
                      class="shrink-0 rounded-full border border-divider-regular bg-background-default-subtle px-2 py-1 text-[11px] text-text-tertiary"
                    >
                      {{ (task.updatedAt || task.createdAt) | relative }}
                    </div>
                  </div>

                  @if (task.prompt) {
                    <p class="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary" [title]="task.prompt">
                      {{ task.prompt }}
                    </p>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="flex min-h-[12rem] flex-1 items-center justify-center px-6 text-center">
            <p class="max-w-lg text-lg font-medium text-text-tertiary">
              {{
                'PAC.Chat.ClawXpert.NoScheduledTasksHint'
                  | translate
                    : {
                        Default: 'No scheduled tasks yet. You can create one from a conversation.'
                      }
              }}
            </p>
          </div>
        }
      </z-card-content>
    </z-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatScheduledTaskSummaryCardComponent {
  readonly tasks = input<IXpertTask[]>([])
  readonly count = input(0)
  readonly create = output<void>()
  readonly action = output<void>()
}
