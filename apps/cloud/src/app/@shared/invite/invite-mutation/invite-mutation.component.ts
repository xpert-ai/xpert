import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, Input, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { MtxButtonModule } from '@ng-matero/extensions/button'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage } from '../../../@core'
import { ToastrService } from '../../../@core/services'
import { ICreateEmailInvitesOutput, InvitationTypeEnum } from '../../../@core/types'
import { TranslationBaseComponent } from '../../language/translation-base.component'
import { EmailInviteFormComponent } from '../forms'
import { InviteFormsModule } from '../forms/invite-forms.module'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    MatButtonModule,
    DragDropModule,
    MtxButtonModule,
    ButtonGroupDirective,

    InviteFormsModule
  ],
  selector: 'pac-invite-mutation',
  templateUrl: './invite-mutation.component.html',
  styleUrls: ['./invite-mutation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InviteMutationComponent extends TranslationBaseComponent {
  private readonly toastrService = inject(ToastrService)
  private readonly _dialogRef = inject(DialogRef<ICreateEmailInvitesOutput>)

  /*
   * Getter & Setter for InvitationTypeEnum
   */
  _invitationType: InvitationTypeEnum = InvitationTypeEnum.USER
  get invitationType(): InvitationTypeEnum {
    return this._invitationType
  }
  @Input() set invitationType(value: InvitationTypeEnum) {
    this._invitationType = value
  }

  @ViewChild('emailInviteForm')
  emailInviteForm: EmailInviteFormComponent

  async onApply() {
    try {
      const result = await this.emailInviteForm.saveInvites()

      this.toastrService.success('TOASTR.MESSAGE.INVITES_RESULT', {
        ...result,
        Default: `Invites ${result.total}, ignored ${result.ignored}`
      })

      this._dialogRef.close(result)
    } catch (err) {
      this.toastrService.success(getErrorMessage(err))
    }
  }

  cancel() {
    this._dialogRef.close()
  }
}
