import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal
} from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { getErrorMessage, injectToastr, IXpertProjectTask, XpertProjectService } from '@cloud/app/@core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MatTooltipModule, NgmSpinComponent],
  selector: 'xpert-project-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertProjectTasksComponent {
  readonly projectService = inject(XpertProjectService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly projectId = input.required<string>()
  readonly threadId = input<string>()
  readonly tasks = model<IXpertProjectTask[]>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly _tasks = computed(() => this.tasks()?.map((task) => ({ ...task, __expand__: true })))
  readonly loading = signal(false)

  constructor() {
    effect(() => {
      if (this.editable()) {
        this.refresh()
      }
    }, { allowSignalWrites: true })
  }

  refresh() {
    this.loading.set(true)
    this.projectService.refreshTasks(this.projectId(), this.threadId()).subscribe({
      next: (tasks) => {
        this.loading.set(false)
        this.tasks.set(tasks)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
