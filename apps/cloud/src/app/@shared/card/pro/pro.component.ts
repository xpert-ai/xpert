import { CommonModule } from '@angular/common'
import { Component, input, output } from '@angular/core'
import { I18nObject, injectHelpWebsite } from '../../../@core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmI18nPipe],
  selector: 'card-pro',
  templateUrl: 'pro.component.html',
  styleUrls: ['pro.component.scss']
})
export class CardProComponent {
  readonly helpWebsite = injectHelpWebsite()

  readonly title = input<string>(null)
  readonly description = input<I18nObject>(null)
  readonly helpUrl = input<string>(null)
  readonly helpTitle = input<string>(null)

  onCreate() {
  }
}
