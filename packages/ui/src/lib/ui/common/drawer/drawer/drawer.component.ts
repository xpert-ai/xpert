import { ChangeDetectionStrategy, Component, HostBinding, model } from '@angular/core'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-drawer',
  templateUrl: './drawer.component.html',
  styleUrls: ['./drawer.component.scss'],
  imports: []
})
export class NgmDrawerComponent {
  readonly opened = model<boolean>()

  @HostBinding('class.opened')
  get _opened() {
    return this.opened()
  }

  toggle() {
    this.opened.update((opened) => !opened)
  }
}
