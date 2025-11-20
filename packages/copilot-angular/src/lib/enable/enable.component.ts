import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { NgmCopilotService } from '../services'
import { map } from 'rxjs'

/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-copilot-enable',
  templateUrl: 'enable.component.html',
  styleUrls: ['enable.component.scss'],
  imports: [CommonModule, RouterModule, TranslateModule],
  host: {
    class: 'ngm-copilot-enable'
  }
})
export class NgmCopilotEnableComponent {
  private copilotService = inject(NgmCopilotService)

  @Input() title: string
  @Input() subTitle: string
  @Output() toConfig = new EventEmitter()

  readonly disabled$ = this.copilotService.enabled$.pipe(map((enabled) => !enabled))
  readonly copilot = this.copilotService.copilot

  navigateToConfig() {
    this.toConfig.emit()
  }
}
