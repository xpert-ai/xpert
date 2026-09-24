import { Component, effect, input, signal } from '@angular/core'

@Component({
  standalone: true,
  selector: 'xp-agent-plugin-avatar',
  host: {
    class: 'inline-flex shrink-0 items-center justify-center',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()'
  },
  template: `
    @if (src() && !failed()) {
      <img class="h-full w-full object-contain" [src]="src()" alt="" (error)="failed.set(true)" />
    } @else {
      <i class="ri-puzzle-2-line text-text-tertiary" [style.font-size.px]="size() * 0.75" aria-hidden="true"></i>
    }
  `
})
export class AgentPluginAvatarComponent {
  readonly src = input<string>()
  readonly size = input(40)
  readonly failed = signal(false)
  constructor() {
    effect(() => {
      this.src()
      this.failed.set(false)
    })
  }
}
