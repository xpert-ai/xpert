import { Component, computed, input } from '@angular/core'

// A deliberately small Markdown subset. Text interpolation never executes HTML or loads remote media.
@Component({
  standalone: true,
  selector: 'xp-notification-text',
  template: `<div class="space-y-2 break-words">
    @for (line of lines(); track $index) {
      @if (line.heading) {
        <h3 class="font-semibold">{{ line.text }}</h3>
      } @else {
        <p class="whitespace-pre-wrap">{{ line.text }}</p>
      }
    }
  </div>`
})
export class NotificationTextComponent {
  readonly text = input('')
  readonly lines = computed(() =>
    this.text()
      .split('\n')
      .map((text) => ({ heading: /^#{1,3} /.test(text), text: text.replace(/^#{1,3} /, '').replace(/^[-*] /, '• ') }))
  )
}
