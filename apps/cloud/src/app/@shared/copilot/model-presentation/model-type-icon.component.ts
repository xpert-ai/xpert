import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import {
  AudioLines,
  Binary,
  Image,
  LayoutGrid,
  ListOrdered,
  LucideIconData,
  MessageSquareText,
  Mic,
  ShieldCheck,
  Sparkles,
  Video,
  Volume2
} from 'lucide-angular'

const modelTypeIcons: Record<AiModelTypeEnum, LucideIconData> = {
  [AiModelTypeEnum.REALTIME]: AudioLines,
  [AiModelTypeEnum.LLM]: MessageSquareText,
  [AiModelTypeEnum.TEXT_EMBEDDING]: Binary,
  [AiModelTypeEnum.RERANK]: ListOrdered,
  [AiModelTypeEnum.SPEECH2TEXT]: Mic,
  [AiModelTypeEnum.MODERATION]: ShieldCheck,
  [AiModelTypeEnum.TTS]: Volume2,
  [AiModelTypeEnum.IMAGE]: Image,
  [AiModelTypeEnum.TEXT2IMG]: Image,
  [AiModelTypeEnum.VIDEO]: Video
}

@Component({
  standalone: true,
  selector: 'xp-model-type-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ZardIconComponent],
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `<z-icon [zType]="icon()" class="size-4" />`
})
export class ModelTypeIconComponent {
  readonly type = input.required<AiModelTypeEnum | '__all__'>()
  readonly icon = computed(() => {
    const type = this.type()
    return type === '__all__' ? LayoutGrid : (modelTypeIcons[type] ?? Sparkles)
  })
}
