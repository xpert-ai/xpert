import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { Announcement } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'
import { NotificationTextComponent } from './notification-text.component'

@Component({
  standalone: true,
  selector: 'xp-announcement-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, ZardButtonComponent, ...ZardCardImports, ZardIconComponent, NotificationTextComponent],
  template: `<z-card
    class="pointer-events-auto max-h-[calc(100dvh-6rem)] gap-0 py-0 shadow-lg"
    [attr.aria-labelledby]="'announcement-notice-' + item().id"
    (keydown.escape)="$event.stopPropagation(); dismissed.emit()"
  >
    <z-card-header class="shrink-0 gap-3 px-4 pt-4">
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
        aria-hidden="true"
      >
        <z-icon zType="bell" />
      </span>
      <div class="min-w-0 flex-1" role="status">
        <p class="text-xs text-muted-foreground">
          {{ 'XP.Notifications.Announcement' | translate }}
          @if (item().severity === 'important') {
            · {{ 'XP.Notifications.Important' | translate }}
          }
        </p>
        <h2 [id]="'announcement-notice-' + item().id" class="mt-1 break-words text-sm font-semibold">
          {{ item().title }}
        </h2>
      </div>
      <button
        z-button
        zType="ghost"
        zSize="icon"
        class="shrink-0"
        [attr.aria-label]="'XP.Notifications.Dismiss' | translate"
        (click)="dismissed.emit()"
      >
        <z-icon zType="x" />
      </button>
    </z-card-header>
    <z-card-content
      [id]="'announcement-body-' + item().id"
      [class]="expanded() ? 'mt-3 min-h-0 max-h-[40vh] overflow-y-auto overscroll-contain px-4 py-0' : 'mt-3 px-4 py-0'"
    >
      @if (expanded()) {
        <xp-notification-text [text]="item().body" />
      } @else {
        <p class="line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
          {{ item().body }}
        </p>
      }
    </z-card-content>
    <z-card-footer class="shrink-0 flex-wrap justify-end gap-2 px-4 pb-4 pt-3">
      <button
        z-button
        zType="ghost"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="'announcement-body-' + item().id"
        (click)="expanded.set(!expanded())"
      >
        {{ (expanded() ? 'XP.Notifications.CollapseNotice' : 'XP.Notifications.ExpandNotice') | translate }}
      </button>
      @if (item().action; as action) {
        <a z-button zType="secondary" [href]="action.url" target="_blank" rel="noopener noreferrer">{{
          action.label
        }}</a>
      }
      <button z-button zType="secondary" (click)="dismissed.emit()">
        {{ 'XP.Notifications.Dismiss' | translate }}
      </button>
    </z-card-footer>
  </z-card>`
})
export class AnnouncementNoticeComponent {
  readonly item = input.required<Announcement>()
  readonly dismissed = output<void>()
  readonly expanded = signal(false)
}
