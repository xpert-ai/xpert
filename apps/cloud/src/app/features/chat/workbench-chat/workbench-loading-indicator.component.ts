import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-workbench-loading-indicator',
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        role="status"
        data-workbench-loading-indicator
        class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5"
      >
        <span class="sr-only">{{ 'XP.Common.Loading' | translate: { Default: 'Loading...' } }}</span>
        <div class="h-full w-full animate-pulse bg-primary/50 motion-reduce:animate-none" aria-hidden="true"></div>
      </div>
    }
  `
})
export class WorkbenchLoadingIndicatorComponent {
  readonly visible = signal(false)

  constructor() {
    // The loading branch owns this component, so quick transitions cancel the feedback entirely.
    const timer = setTimeout(() => this.visible.set(true), 400)
    inject(DestroyRef).onDestroy(() => clearTimeout(timer))
  }
}
