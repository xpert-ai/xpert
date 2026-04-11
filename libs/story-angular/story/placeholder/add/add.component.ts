import { Component, HostListener, inject } from '@angular/core'
import { WidgetMenuType, WidgetService } from '@xpert-ai/core'

@Component({
  standalone: true,
  imports: [],
  selector: 'pac-placeholder-add',
  templateUrl: './add.component.svg',
  styleUrls: ['./add.component.scss']
})
export class PlaceholderAddComponent {
  protected readonly widgetService? = inject(WidgetService, { optional: true })

  openDesigner() {
    this.widgetService?.clickMenu({
      key: 'open_designer',
      type: WidgetMenuType.Action
    })
  }

  @HostListener('click')
  onClick() {
    this.openDesigner()
  }
}
