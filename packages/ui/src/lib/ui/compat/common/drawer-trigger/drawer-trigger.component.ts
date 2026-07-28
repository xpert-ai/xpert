import { ChangeDetectionStrategy, Component, HostBinding, input, model } from '@angular/core'

@Component({
  selector: 'xp-drawer-trigger',
  standalone: true,
  imports: [],
  templateUrl: './drawer-trigger.component.html',
  styleUrl: './drawer-trigger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpDrawerTriggerComponent {
  readonly opened = model<boolean>()

  readonly side = input<'left' | 'right'>('left')

  toggle() {
    this.opened.update((opened) => !opened)
  }

  @HostBinding('class.xp-drawer__opened')
  get _opened() {
    return this.opened()
  }
}
