import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { UsersService } from '@metad/cloud/state'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { IUserUpdateInput, LanguagesEnum, Store, ToastrService, User } from '../../../@core'
import { UserFormsModule } from '../../../@shared/user/forms'
import { CreatedByPipe } from '../../../@shared/pipes'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    UserFormsModule,
    TranslateModule,

    ButtonGroupDirective,
    DensityDirective
  ],
  selector: 'pac-account-profile',
  template: `<div class="flex flex-col items-center justify-start p-4">
    <pac-user-basic-info-form #form class="block max-w-full md:max-w-[600px] lg:max-w-[900px]" [(ngModel)]="user">
    </pac-user-basic-info-form>
    <div ngmButtonGroup>
      <button
        mat-raised-button
        displayDensity="cosy"
        color="primary"
        [disabled]="form.form.invalid || form.form.pristine"
        (click)="save(form.form)"
      >
        <mat-icon fontSet="material-icons-outlined" displayDensity="cosy">save</mat-icon>
        {{ 'PAC.ACTIONS.SAVE' | translate: { Default: 'Save' } }}
      </button>
    </div>
  </div>`,
  styles: [``]
})
export class PACAccountProfileComponent {
  user: User

  private _userSub = this.store.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
    this.user = cloneDeep(user) as User
  })
  constructor(
    private readonly store: Store,
    private readonly userService: UsersService,
    private readonly _toastrService: ToastrService,
    private readonly _cdr: ChangeDetectorRef
  ) {}

  async save(form: FormGroup) {
    const { email, firstName, lastName, tags, preferredLanguage, username, password, imageUrl } = this.user
    let request: IUserUpdateInput = {
      email,
      firstName,
      lastName,
      tags,
      username,
      imageUrl,
      preferredLanguage: preferredLanguage as LanguagesEnum
    }

    if (password) {
      request = {
        ...request,
        hash: password
      }
    }

    try {
      await firstValueFrom(this.userService.updateMe(request))
      this._toastrService.success(`PAC.NOTES.USERS.USER_UPDATED`, {
        Default: 'User Updated',
        name: new CreatedByPipe().transform(this.user)
      })
      form.markAsPristine()
      this._cdr.detectChanges()
    } catch (error) {
      this._toastrService.error(error)
    }
  }
}
