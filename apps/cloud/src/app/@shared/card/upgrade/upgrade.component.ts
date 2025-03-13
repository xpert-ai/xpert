import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite } from '../../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'card-upgrade',
  templateUrl: 'upgrade.component.html',
  styleUrls: ['upgrade.component.scss']
})
export class CardUpgradeComponent {
  readonly helpWebsite = injectHelpWebsite()
}
