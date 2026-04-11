
import { Component, input, output } from '@angular/core'
import { injectHelpWebsite } from '../../../@core'

@Component({
  standalone: true,
  imports: [],
  selector: 'ngm-card-create',
  templateUrl: 'create.component.html',
  styleUrls: ['create.component.scss']
})
export class CardCreateComponent {
  readonly helpWebsite = injectHelpWebsite()

  readonly title = input<string>(null)
  readonly description = input<string>(null)
  readonly helpUrl = input<string>(null)
  readonly helpTitle = input<string>(null)

  readonly create = output()

  onCreate() {
    this.create.emit()
  }
}
