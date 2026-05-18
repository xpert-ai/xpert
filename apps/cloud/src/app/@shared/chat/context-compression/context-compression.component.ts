import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { resolveI18nText, type TContextCompressionComponentData } from '@cloud/app/@core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'chat-context-compression-chunk',
  imports: [TranslateModule, ...ZardTooltipImports],
  template: `
    <div
      class="my-6 flex w-full items-center justify-center gap-3 py-6"
      [zTooltip]="tooltipText()"
      zPosition="top"
      zTooltipClass="max-w-xl max-h-80 whitespace-pre-wrap overflow-auto text-left"
    >
      <div class="h-px min-w-8 flex-1 bg-divider-regular"></div>
      <div
        class="inline-flex max-w-[80%] shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-text-tertiary transition-colors hover:bg-hover-bg hover:text-text-secondary"
        [class.text-text-destructive]="status() === 'fail'"
        [class.cursor-help]="!!tooltipText()"
      >
        <i class="shrink-0 text-base" [class]="iconClass()"></i>
        <span class="truncate" [class.context-compression-running-text]="status() === 'running'">{{
          labelKey() | translate: { Default: labelDefault() }
        }}</span>
      </div>
      <div class="h-px min-w-8 flex-1 bg-divider-regular"></div>
    </div>
  `,
  styles: `
    @keyframes context-compression-text-shimmer {
      0% {
        background-position: 100% 50%;
      }

      47.37%,
      100% {
        background-position: 0% 50%;
      }
    }

    .context-compression-running-text {
      color: transparent;
      background-image: linear-gradient(
        100deg,
        color-mix(in oklab, var(--muted-foreground) 48%, transparent) 0%,
        color-mix(in oklab, var(--muted-foreground) 48%, transparent) 30%,
        var(--muted-foreground) 38%,
        var(--foreground) 46%,
        var(--color-text-accent) 50%,
        var(--foreground) 54%,
        var(--muted-foreground) 62%,
        color-mix(in oklab, var(--muted-foreground) 48%, transparent) 70%,
        color-mix(in oklab, var(--muted-foreground) 48%, transparent) 100%
      );
      background-size: 250% 100%;
      background-position: 100% 50%;
      background-repeat: no-repeat;
      background-clip: text;
      -webkit-background-clip: text;
      animation: context-compression-text-shimmer 3.8s linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .context-compression-running-text {
        color: var(--muted-foreground);
        background: none;
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatContextCompressionChunkComponent {
  private readonly translate = inject(TranslateService)

  readonly chunk = input<TContextCompressionComponentData>()

  readonly status = computed(() => this.chunk()?.status ?? 'running')

  readonly labelKey = computed(() => {
    if (this.isSkipped()) {
      return 'PAC.Chat.ContextCompressionSkipped'
    }

    switch (this.status()) {
      case 'success':
        return 'PAC.Chat.ContextCompressed'
      case 'fail':
        return 'PAC.Chat.ContextCompressionFailed'
      default:
        return 'PAC.Chat.ContextCompression'
    }
  })

  readonly labelDefault = computed(() => {
    if (this.isSkipped()) {
      return 'Context not compressed'
    }

    switch (this.status()) {
      case 'success':
        return 'Context automatically compressed'
      case 'fail':
        return 'Context compression failed'
      default:
        return 'Automatically compressing context'
    }
  })

  readonly iconClass = computed(() => {
    if (this.isSkipped()) {
      return 'ri-file-reduce-line'
    }

    switch (this.status()) {
      case 'success':
        return 'ri-file-list-2-line'
      case 'fail':
        return 'ri-error-warning-line'
      default:
        return 'ri-loader-2-line animate-spin'
    }
  })

  readonly tooltipText = computed(() => {
    const chunk = this.chunk()
    return resolveI18nText(chunk?.summary || chunk?.error || chunk?.message, this.translate.currentLang)
  })

  private readonly isSkipped = computed(() => {
    const reason = this.chunk()?.reason
    return reason === 'no_messages' || reason === 'no_unprotected_history' || reason === 'no_token_gain'
  })
}
