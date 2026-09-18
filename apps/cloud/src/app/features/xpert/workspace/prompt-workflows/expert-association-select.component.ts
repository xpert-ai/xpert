import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardPopoverDirective
} from '@xpert-ai/headless-ui'

export type PromptWorkflowExpert = Pick<IXpert, 'id' | 'name' | 'title'>

@Component({
  selector: 'xp-prompt-expert-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardPopoverDirective
  ],
  template: `
    <div class="space-y-2">
      <button
        z-button
        zType="outline"
        type="button"
        class="h-auto min-h-10 w-full justify-between py-2 text-left"
        zPopover
        [zContent]="options"
        [zMatchTriggerWidth]="true"
        [disabled]="disabled() || loading()"
        [attr.aria-label]="'XP.PromptWorkflow.AssociatedExperts' | translate"
      >
        <span class="flex min-w-0 items-center gap-2"
          ><z-icon zType="bot" class="shrink-0" />
          <span class="truncate text-text-tertiary">{{
            (loading() ? 'XP.PromptWorkflow.LoadingExperts' : 'XP.PromptWorkflow.SelectExperts') | translate
          }}</span> </span
        ><z-icon zType="chevron-down" class="shrink-0" />
      </button>
      @if (selected().length) {
        <div class="flex flex-wrap gap-2">
          @for (id of selected(); track id) {
            <span
              class="inline-flex max-w-full items-center gap-1 rounded-md border border-divider-regular bg-hover-bg px-2 py-1 text-sm"
            >
              <span class="truncate">{{ name(id) }}</span>
              @if (!loading() && !availableIds().has(id)) {
                <span class="text-xs text-text-destructive">{{ 'XP.PromptWorkflow.Unavailable' | translate }}</span>
              }
              @if (!disabled()) {
                <button
                  z-button
                  zType="ghost"
                  zSize="icon"
                  type="button"
                  class="size-5"
                  (click)="toggle(id, false)"
                  [attr.aria-label]="'XP.PromptWorkflow.RemoveExpert' | translate: { name: name(id) }"
                >
                  <z-icon zType="close" class="size-3" />
                </button>
              }
            </span>
          }
        </div>
      }
      <p class="text-xs leading-5 text-text-tertiary">
        {{
          (selected().length ? 'XP.PromptWorkflow.ExpertScopeHelp' : 'XP.PromptWorkflow.WorkspaceScopeHelp') | translate
        }}
      </p>
    </div>
    <ng-template #options>
      <div class="rounded-lg border border-divider-regular bg-components-panel-bg p-2 shadow-lg">
        <input
          z-input
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          [ngModelOptions]="{ standalone: true }"
          [placeholder]="'XP.PromptWorkflow.SearchExperts' | translate"
          [attr.aria-label]="'XP.PromptWorkflow.SearchExperts' | translate"
        />
        <div class="mt-2 max-h-60 overflow-auto">
          @for (expert of filtered(); track expert.id) {
            <z-checkbox
              class="flex w-full rounded-md px-2 py-2 hover:bg-hover-bg"
              [ngModel]="selected().includes(expert.id)"
              [ngModelOptions]="{ standalone: true }"
              (ngModelChange)="toggle(expert.id, $event)"
              [zDisabled]="disabled()"
            >
              {{ expert.title || expert.name }}
            </z-checkbox>
          } @empty {
            <p class="px-2 py-4 text-sm text-text-tertiary">{{ 'XP.PromptWorkflow.NoExperts' | translate }}</p>
          }
        </div>
      </div>
    </ng-template>
  `
})
export class PromptExpertSelectComponent {
  readonly experts = input<PromptWorkflowExpert[]>([])
  readonly selected = input<string[]>([])
  readonly disabled = input(false)
  readonly loading = input(false)
  readonly selectionChange = output<string[]>()
  readonly search = signal('')
  readonly availableIds = computed(() => new Set(this.experts().map((expert) => expert.id)))
  readonly filtered = computed(() =>
    this.experts().filter((expert) =>
      `${expert.title ?? ''} ${expert.name}`.toLocaleLowerCase().includes(this.search().trim().toLocaleLowerCase())
    )
  )

  name(id: string) {
    const expert = this.experts().find((item) => item.id === id)
    return expert?.title || expert?.name || id
  }

  toggle(id: string, selected: boolean) {
    if (this.disabled() || (selected && !this.availableIds().has(id))) return
    this.selectionChange.emit(
      selected ? [...new Set([...this.selected(), id])] : this.selected().filter((item) => item !== id)
    )
  }
}
