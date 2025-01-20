import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, of } from 'rxjs'
import { XpertTaskService } from '../../../@core'
import { IXpertTask, XpertTaskStatus } from '../../../@core/types'
import { XpertTaskDialogComponent } from '../../../@shared/chat'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule
  ],
  selector: 'chat-component-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentTasksComponent {
  eTimeGranularity = TimeGranularity
  eXpertTaskStatus = XpertTaskStatus

  readonly dialog = inject(Dialog)
  readonly taskService = inject(XpertTaskService)

  // Inputs
  readonly tasks = input<IXpertTask[]>()

  // States
  readonly taskDetails = derivedAsync(() => {
    return this.tasks().length
      ? this.taskService
          .getByIds(this.tasks().map((_) => _.id))
          .pipe(
            map(({ items }) =>
              this.tasks().map((_) => items.find((item) => item.id === _.id) ?? { ..._, deletedAt: new Date() })
            )
          )
      : of([])
  })

  constructor() {
    effect(() => {
      // console.log(this.tasks())
    })
  }

  editTask(task: IXpertTask) {
    this.dialog
      .open(XpertTaskDialogComponent, {
        data: {
          task
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }
}
