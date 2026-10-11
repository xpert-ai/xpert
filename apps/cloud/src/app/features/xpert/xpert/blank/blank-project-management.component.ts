import { ChangeDetectionStrategy, Component, afterNextRender, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { BlankProjectManagement } from './blank-project-management'

@Component({
  selector: 'xp-blank-project-management',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, ZardSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-5 border-t border-components-panel-border pt-5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h3 id="project-management-label" class="text-sm font-medium text-text-primary">
            {{ state().option()?.label || ('XP.Xpert.ProjectManagement.Title' | translate) }}
          </h3>
          <p id="project-management-description" class="mt-1 text-sm leading-6 text-text-secondary">
            {{ state().option()?.description || ('XP.Xpert.ProjectManagement.Description' | translate) }}
          </p>
        </div>
        <z-switch
          class="shrink-0"
          aria-labelledby="project-management-label"
          aria-describedby="project-management-description"
          [disabled]="disabled() || state().loading() || !state().option()"
          [checked]="state().enabled()"
          (change)="state().enabled.set($event.checked)"
          ><span class="sr-only">{{
            state().option()?.label || ('XP.Xpert.ProjectManagement.Title' | translate)
          }}</span></z-switch
        >
      </div>
      @if (state().loading()) {
        <p role="status" class="mt-2 text-sm text-text-secondary">
          {{ 'XP.COMMON.Loading' | translate: { Default: 'Loading…' } }}
        </p>
      }
      @if (state().error()) {
        <p role="alert" class="mt-2 text-sm text-text-destructive">{{ state().error() }}</p>
        @if (!state().loaded()) {
          <button
            type="button"
            z-button
            zType="ghost"
            [zDisabled]="state().loading() || disabled()"
            (click)="state().load()"
          >
            {{ 'XP.ACTIONS.Retry' | translate: { Default: 'Retry' } }}
          </button>
        }
      }
    </section>
  `
})
export class BlankProjectManagementComponent {
  readonly state = input.required<BlankProjectManagement>()
  readonly disabled = input(false)

  constructor() {
    afterNextRender(() => void this.state().load())
  }
}
