import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'chat-context-compression-chunk',
  imports: [TranslateModule],
  template: `
    <div class="my-2 flex items-center justify-center gap-2 py-2">
      <div class="h-px grow rotate-180 bg-gradient-to-r from-divider-regular to-divider-deep"></div>
      <div class="shrink-0 text-xs text-text-tertiary">
        {{ 'PAC.Chat.ContextCompression' | translate: { Default: 'Context compression...' } }}
      </div>
      <div class="h-px grow bg-gradient-to-r from-divider-regular to-divider-deep"></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatContextCompressionChunkComponent {}
