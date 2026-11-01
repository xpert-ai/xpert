import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { parseFileActivityContent } from '@xpert-ai/chatkit-types'

@Component({
  selector: 'xpert-preview-file-activity',
  standalone: true,
  imports: [TranslateModule],
  template: `
    @if (receipt(); as receipt) {
      <section class="my-2 rounded-lg border border-divider-regular p-3 text-sm text-text-secondary">
        @if (receipt.kind === 'changes') {
          <div class="font-medium text-text-primary">{{ 'XP.Chat.FileActivity.Changes' | translate }}</div>
          <p class="text-xs">{{ 'XP.Chat.FileActivity.Coverage.' + receipt.coverage | translate }}</p>
          @for (file of receipt.fileChanges; track file.id) {
            <div class="mt-2 flex flex-wrap gap-2">
              <span>{{ 'XP.Chat.FileActivity.Operation.' + file.operation | translate }}</span>
              <span class="break-all font-mono">{{ file.workspacePath }}</span>
            </div>
          }
        } @else if (receipt.status === 'success') {
          <div class="font-medium text-text-primary">{{ 'XP.Chat.FileActivity.Delivered' | translate }}</div>
          @for (output of receipt.outputs; track output.id) {
            <div class="mt-2 break-all">{{ output.title }}</div>
          }
        } @else {
          <div role="alert" class="text-text-destructive">
            {{ 'XP.Chat.FileActivity.DeliveryFailed' | translate }}: {{ receipt.error }}
          </div>
        }
      </section>
    } @else {
      <p role="alert" class="text-text-destructive">{{ 'XP.Chat.FileActivity.Invalid' | translate }}</p>
    }
  `
})
export class PreviewFileActivityComponent {
  readonly content = input.required<unknown>()
  readonly receipt = computed(() => parseFileActivityContent(this.content())?.data)
}
