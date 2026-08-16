import { Component } from '@angular/core'
import { ModelUsageLedgerComponent } from './model-usage-ledger.component'

@Component({
  standalone: true,
  selector: 'xp-settings-copilot-usage-center',
  templateUrl: './usage-center.component.html',
  styleUrls: ['./usage-center.component.scss'],
  imports: [ModelUsageLedgerComponent]
})
export class CopilotUsageCenterComponent {}
