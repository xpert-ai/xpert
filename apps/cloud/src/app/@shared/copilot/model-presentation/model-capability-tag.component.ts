import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ModelFeature } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { Brain, Braces, Eye, Layers, LucideIconData, Radio, Sparkles, Video, Wrench } from 'lucide-angular'

const featureIcons: Record<ModelFeature, LucideIconData> = {
  [ModelFeature.TOOL_CALL]: Wrench,
  [ModelFeature.MULTI_TOOL_CALL]: Layers,
  [ModelFeature.AGENT_THOUGHT]: Brain,
  [ModelFeature.VISION]: Eye,
  [ModelFeature.STREAM_TOOL_CALL]: Radio,
  [ModelFeature.VIDEO]: Video,
  [ModelFeature.STRUCTURED_OUTPUT]: Braces
}

@Component({
  standalone: true,
  selector: 'xp-model-capability-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, ZardButtonComponent, ZardIconComponent],
  host: { class: 'inline-flex shrink-0' },
  template: `
    @let label = 'XP.ModelSettings.Feature.' + feature() | translate: { Default: feature() };
    <button
      z-button
      zType="outline"
      type="button"
      [attr.aria-label]="label"
      class="group/capability h-7 gap-0 rounded-md px-1.5 py-0 text-xs font-normal text-muted-foreground shadow-none transition-colors duration-200 focus:text-foreground motion-reduce:transition-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
    >
      <z-icon [zType]="icon()" class="size-3.5" aria-hidden="true" />
      <span
        aria-hidden="true"
        class="grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-200 ease-out group-hover/capability:grid-cols-[1fr] group-hover/capability:opacity-100 group-focus/capability:grid-cols-[1fr] group-focus/capability:opacity-100 motion-reduce:transition-none"
      >
        <span class="overflow-hidden"
          ><span class="pl-1.5">{{ label }}</span></span
        >
      </span>
    </button>
  `
})
export class ModelCapabilityTagComponent {
  readonly feature = input.required<ModelFeature>()
  readonly icon = computed(() => featureIcons[this.feature()] ?? Sparkles)
}
