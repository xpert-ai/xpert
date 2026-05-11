import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardMenuImports,
  ZardSegmentedComponent,
  ZardSegmentedItemComponent
} from '@xpert-ai/headless-ui'
import { ChatFollowUpBehavior, ChatFollowUpRailItem, getPendingFollowUpText } from './follow-ups'
import { getReferenceKey, getReferenceLabel } from '../references'

@Component({
  standalone: true,
  selector: 'xp-chat-follow-ups',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ...ZardMenuImports
  ],
  templateUrl: './follow-ups.component.html',
  styleUrl: './follow-ups.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatFollowUpsComponent {
  readonly items = input<ChatFollowUpRailItem[]>([])
  readonly loading = input(false)
  readonly behavior = input<ChatFollowUpBehavior>('queue')
  readonly attachToComposer = input(true)

  readonly behaviorChange = output<ChatFollowUpBehavior>()
  readonly promoteToSteer = output<string>()
  readonly sendNow = output<string>()
  readonly edit = output<ChatFollowUpRailItem>()
  readonly remove = output<string>()
  readonly turnOffQueueing = output<void>()

  readonly settingsOpen = signal(false)
  readonly hasItems = computed(() => this.items().length > 0)
  readonly referenceKey = getReferenceKey
  readonly referenceLabel = getReferenceLabel

  text(item: ChatFollowUpRailItem, referencedContentFallback: string) {
    return getPendingFollowUpText(item, referencedContentFallback)
  }

  toggleSettings() {
    this.settingsOpen.update((value) => !value)
  }

  setBehavior(behavior: ChatFollowUpBehavior) {
    this.behaviorChange.emit(behavior)
    this.settingsOpen.set(false)
  }

  onPromoteToSteer(item: ChatFollowUpRailItem) {
    if (item.id) {
      this.promoteToSteer.emit(item.id)
    }
  }

  onSendNow(item: ChatFollowUpRailItem) {
    if (item.id) {
      this.sendNow.emit(item.id)
    }
  }

  onRemove(item: ChatFollowUpRailItem) {
    if (item.id) {
      this.remove.emit(item.id)
    }
  }

  onEdit(item: ChatFollowUpRailItem) {
    this.edit.emit(item)
  }

  onTurnOffQueueing() {
    this.turnOffQueueing.emit()
  }
}
