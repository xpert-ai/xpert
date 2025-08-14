import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ChecklistItem } from '@metad/cloud/state'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-checklist',
  templateUrl: 'checklist.component.html',
  styleUrls: ['checklist.component.scss'],
  imports: [CommonModule, TranslateModule, NgmI18nPipe],
  host: {
    class: 'xp-checklist'
  }
})
export class ChecklistComponent {
  readonly checklist = input<ChecklistItem[]>()
}
