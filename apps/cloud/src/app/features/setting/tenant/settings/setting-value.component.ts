import { Clipboard } from '@angular/cdk/clipboard'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-tenant-setting-value',
  imports: [TranslateModule, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (display(); as content) {
      @if (content.structured || content.long) {
        <div class="min-w-0 rounded-md bg-muted/50">
          <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-1">
            <span class="text-xs font-medium text-muted-foreground">
              {{ content.structured ? 'JSON' : ('XP.SettingsValue.Text' | translate) }}
            </span>
            <div class="flex items-center gap-1">
              @if (content.long) {
                <button
                  z-button
                  zType="ghost"
                  zSize="sm"
                  type="button"
                  [attr.aria-expanded]="expanded()"
                  [attr.aria-controls]="contentId()"
                  (click)="expanded.set(!expanded())"
                >
                  {{ (expanded() ? 'XP.SettingsValue.Collapse' : 'XP.SettingsValue.Expand') | translate }}
                </button>
              }
              <button z-button zType="ghost" zSize="sm" type="button" (click)="copy()">
                <i
                  [class]="copyStatus() === 'XP.SettingsValue.Copied' ? 'ri-check-line' : 'ri-file-copy-line'"
                  aria-hidden="true"
                ></i>
                {{ (copyStatus() === 'XP.SettingsValue.Copied' ? copyStatus() : 'XP.ACTIONS.Copy') | translate }}
              </button>
            </div>
          </div>
          <pre
            [id]="contentId()"
            tabindex="0"
            [attr.aria-label]="name()"
            class="m-0 overflow-auto px-3 pb-3 font-mono text-sm leading-5"
            [class]="expanded() ? 'max-h-96' : 'max-h-36'"
          ><code>{{ expanded() ? content.text : content.preview }}</code></pre>
        </div>
      } @else {
        <div class="flex min-w-0 items-start justify-between gap-2">
          <span
            class="whitespace-pre-wrap break-words py-1.5 text-sm [overflow-wrap:anywhere]"
            [class]="content.text === '' ? 'text-muted-foreground' : ''"
          >
            {{ content.text === '' ? ('XP.SettingsValue.Empty' | translate) : content.text }}
          </span>
          <button
            z-button
            zType="ghost"
            zSize="sm"
            type="button"
            class="shrink-0"
            [attr.aria-label]="'XP.ACTIONS.Copy' | translate"
            (click)="copy()"
          >
            <i
              [class]="copyStatus() === 'XP.SettingsValue.Copied' ? 'ri-check-line' : 'ri-file-copy-line'"
              aria-hidden="true"
            ></i>
          </button>
        </div>
      }
      <span role="status" class="sr-only">{{ copyStatus() ? (copyStatus() | translate) : '' }}</span>
    }
  `
})
export class SettingValueComponent {
  private readonly clipboard = inject(Clipboard)
  readonly value = input.required<unknown>()
  readonly name = input.required<string>()
  readonly contentId = input.required<string>()
  readonly expanded = signal(false)
  readonly copyStatus = signal('')
  readonly display = computed(() => {
    const raw = this.value()
    let parsed: unknown = raw
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Non-JSON values remain plain text, including incomplete JSON.
      }
    }
    const structured = parsed !== null && typeof parsed === 'object'
    const text = structured ? JSON.stringify(parsed, null, 2) : String(raw ?? '')
    const lines = text.split('\n')
    const long = lines.length > 5 || lines.some((line) => line.length > 160)
    const preview = long
      ? lines
          .slice(0, 5)
          .map((line) => (line.length > 160 ? line.slice(0, 160) + '…' : line))
          .join('\n') + '\n…'
      : text
    return { text, structured, long, preview }
  })

  copy() {
    this.copyStatus.set(
      this.clipboard.copy(this.display().text) ? 'XP.SettingsValue.Copied' : 'XP.SettingsValue.CopyFailed'
    )
  }
}
