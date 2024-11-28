import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, input, model } from '@angular/core'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-drawer-container',
  templateUrl: './drawer-container.component.html',
  styleUrls: ['./drawer-container.component.scss'],
  imports: [CommonModule,]
})
export class NgmDrawerContainerComponent {
  readonly opened = model<boolean>()
  readonly mode = input<'over' | 'push' | 'side'>('side')

  @HostBinding('class.opened')
  get _opened() {
    return this.opened()
  }

  @HostBinding('class.over')
  get _over() {
    return this.mode() === 'over'
  }

  toggle() {
    this.opened.update((opened) => !opened)
  }
}
