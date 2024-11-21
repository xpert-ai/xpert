import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { debounceTime, map, of, switchMap, tap } from 'rxjs'
import {
  getErrorMessage,
  IXpertRole,
  IXpertWorkspace,
  TAvatar,
  ToastrService,
  uuid,
  XpertService,
  XpertTypeEnum
} from '../../../../@core'
import { MaterialModule } from '../../../../@shared'
import { EmojiAvatarComponent } from '../../../../@shared/avatar'

@Component({
  selector: 'xpert-copilot',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ButtonGroupDirective,
    MaterialModule,
    FormsModule,
    CdkListboxModule,
    EmojiAvatarComponent
  ],
  templateUrl: './copilot.component.html',
  styleUrl: './copilot.component.scss'
})
export class XpertCopilotComponent {
  eXpertTypeEnum = XpertTypeEnum

  readonly xpertService = inject(XpertService)
  readonly #toastr = inject(ToastrService)
 
}
