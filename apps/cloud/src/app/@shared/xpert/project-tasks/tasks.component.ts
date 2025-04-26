import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IXpertProjectTask } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MatTooltipModule],
  selector: 'xpert-project-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertProjectTasksComponent {
  // Inputs
  readonly tasks = input<IXpertProjectTask[]>()

  readonly _tasks = computed(() => this.tasks()?.map((task) => ({ ...task, __expand__: true })))
}
