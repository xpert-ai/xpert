import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { SafePipe } from '@metad/core'

@Component({
  selector: 'xp-workflow-custom-icon',
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SafePipe]
})
export class XpertWorkflowCustomIconComponent {
  readonly icon = input<{
    svg?: string
    color?: string
  }>()
}
