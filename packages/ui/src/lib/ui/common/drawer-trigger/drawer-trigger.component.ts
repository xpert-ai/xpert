import { ChangeDetectionStrategy, Component, HostBinding, input, model } from '@angular/core'

@Component({
  selector: 'ngm-drawer-trigger',
  standalone: true,
  imports: [],
  templateUrl: './drawer-trigger.component.html',
  styleUrl: './drawer-trigger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgmDrawerTriggerComponent {
  readonly opened = model<boolean>()

  readonly side = input<'left' | 'right'>('left')

  toggle() {
    this.opened.update((opened) => !opened)
  }

  @HostBinding('class.ngm-drawer__opened')
  get _opened() {
    return this.opened()
  }
}
