import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { injectToastr, IXpertProjectTask, TMessageComponent, XpertTaskService } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'

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
  selector: 'chat-component-message-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageTasksComponent {
  readonly dialog = inject(Dialog)
  readonly taskService = inject(XpertTaskService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly data = input<TMessageComponent<{ tasks: IXpertProjectTask[] }>>()

  // States
  readonly tasks = computed(() => this.data()?.tasks?.map((task) => ({...task, __expand__: true})))
}
