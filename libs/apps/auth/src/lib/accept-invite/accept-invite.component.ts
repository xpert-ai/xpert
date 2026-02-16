import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { TranslateModule } from '@ngx-translate/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { InviteService, ToastrService } from '@metad/cloud/state'
import { IInvite, IUserRegistrationInput } from '@metad/contracts'
import { tap } from 'rxjs/operators'
import { AcceptInviteFormComponent } from './accept-invite-form/accept-invite-form.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    AcceptInviteFormComponent
  ],
  selector: 'pac-auth-accept-invite',
  styleUrls: ['./accept-invite.component.scss'],
  templateUrl: 'accept-invite.component.html'
})
export class AcceptInvitePageComponent implements OnInit {
  readonly #destroyRef = inject(DestroyRef)

  invitation: IInvite
  loading: boolean
  inviteLoadErrorMessage: string

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private inviteService: InviteService,
    private toastrService: ToastrService,
    private _cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams
      .pipe(
        tap(() => (this.loading = true)),
        tap(({ email, token }) => this.loadInvite(email, token)),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe()
  }

  loadInvite = async (email: string, token: string) => {
    try {
      this.invitation = await this.inviteService.validateInvite(['role', 'organization'], {
        email,
        token
      })
      if (!this.invitation) {
        throw new Error()
      }
    } catch (error) {
      this.inviteLoadErrorMessage = 'Invitation no longer valid'
    }
    this.loading = false
    this._cdr.detectChanges()
  }

  submitForm = async (input: IUserRegistrationInput) => {
    try {
      const { user, password } = input
      const { id: inviteId, role, organization } = this.invitation
      // if (role.name === RolesEnum.EMPLOYEE) {
      // 	await this.inviteService.acceptEmployeeInvite({
      // 		user,
      // 		password,
      // 		organization,
      // 		inviteId
      // 	});
      // } else {
      await this.inviteService.acceptUserInvite({
        user,
        password,
        organization,
        inviteId
      })

      // }
      this.toastrService.success('Auth.ACCEPT_INVITE.PROFILE_UPDATED')
      this.router.navigate(['/auth/login'])
    } catch (error) {
      this.toastrService.danger(error, null, 'Could not create your account')
    }
  }
}
