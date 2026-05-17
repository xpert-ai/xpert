import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { DateRelativePipe, IStorageFile } from '@cloud/app/@core'
import { FileIconComponent } from '@cloud/app/@shared/files'
import { FileTypePipe } from '@xpert-ai/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardMenuImports,
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import {
  ChatRuntimeCapabilities,
  ChatRuntimeCapabilityKind,
  ChatRuntimeCapabilityOption,
  getCapabilityKindLabelKey,
  getCapabilityKindLabel,
  getRuntimeCapabilityOptions,
  isRuntimeCapabilitySelected,
  setRuntimeCapabilitySelected
} from './composer'
import type { RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'

type ComposerCapabilityGroup = {
  kind: ChatRuntimeCapabilityKind
  label: string
  labelKey: string
  options: ChatRuntimeCapabilityOption[]
}

@Component({
  selector: 'xp-chat-composer-menu',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DateRelativePipe,
    FileIconComponent,
    FileTypePipe,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardSwitchComponent,
    ...ZardMenuImports,
    ...ZardTooltipImports
  ],
  templateUrl: './composer-menu.component.html',
  styleUrl: './composer-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComposerMenuComponent {
  readonly attachmentEnabled = input(false)
  readonly recentAttachments = input<IStorageFile[]>([])
  readonly planMode = input(false)
  readonly runtimeCapabilities = input<ChatRuntimeCapabilities | null>(null)
  readonly runtimeSelection = input<RuntimeCapabilitiesSelection | null>(null)
  readonly runtimeLoading = input(false)

  readonly upload = output<void>()
  readonly recentAttachment = output<IStorageFile>()
  readonly deleteRecentAttachment = output<string>()
  readonly planModeChange = output<boolean>()
  readonly runtimeSelectionChange = output<RuntimeCapabilitiesSelection | null>()

  readonly activeGroup = signal<ChatRuntimeCapabilityKind | null>(null)
  readonly groups = computed<ComposerCapabilityGroup[]>(() => {
    const capabilities = this.runtimeCapabilities()
    return (['skill', 'plugin', 'subAgent'] as const)
      .map((kind) => ({
        kind,
        label: getCapabilityKindLabel(kind),
        labelKey: getCapabilityKindLabelKey(kind),
        options: getRuntimeCapabilityOptions(capabilities, kind)
      }))
      .filter((group) => group.options.length)
  })
  readonly selectedCount = computed(() =>
    this.groups().reduce(
      (total, group) =>
        total + group.options.filter((option) => isRuntimeCapabilitySelected(this.runtimeSelection(), option)).length,
      0
    )
  )

  readonly groupLabel = getCapabilityKindLabel

  togglePlanMode() {
    this.planModeChange.emit(!this.planMode())
  }

  selectGroup(kind: ChatRuntimeCapabilityKind) {
    this.activeGroup.update((current) => (current === kind ? null : kind))
  }

  isSelected(option: ChatRuntimeCapabilityOption) {
    return isRuntimeCapabilitySelected(this.runtimeSelection(), option)
  }

  setCapability(option: ChatRuntimeCapabilityOption, selected: boolean) {
    const workspaceId = option.workspaceId ?? this.runtimeSelection()?.skills?.workspaceId
    this.runtimeSelectionChange.emit(
      setRuntimeCapabilitySelected(this.runtimeSelection(), option, selected, workspaceId)
    )
  }

  trackGroup(_: number, group: ComposerCapabilityGroup) {
    return group.kind
  }

  trackCapability(_: number, option: ChatRuntimeCapabilityOption) {
    return `${option.type}:${option.id}`
  }

  trackFile(_: number, file: IStorageFile) {
    return file.id
  }
}
