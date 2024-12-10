import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { NgmConfirmDeleteComponent, NgmMatSelectComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { UsersService } from '@metad/cloud/state'
import { BehaviorSubject, catchError, firstValueFrom, from, map, switchMap } from 'rxjs'
import { CertificationService, ICertification, ToastrService } from '../../../@core'
import { MaterialModule } from '../../../@shared/material.module'
import { userLabel } from '../../../@shared/pipes'
import { SharedModule } from '../../../@shared/shared.module'
import { UserProfileInlineComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  selector: 'pac-settings-certification',
  templateUrl: './certification.component.html',
  styleUrls: ['./certification.component.scss'],
  imports: [
    SharedModule,
    CommonModule,
    TranslateModule,
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonGroupDirective,
    DensityDirective,
    AppearanceDirective,
    NgmMatSelectComponent,
    UserProfileInlineComponent
  ]
})
export class CertificationComponent {
  private readonly certificationService = inject(CertificationService)
  private readonly userService = inject(UsersService)
  private readonly _toastrService = inject(ToastrService)
  private readonly _dialog = inject(MatDialog)
  private readonly _cdr = inject(ChangeDetectorRef)

  certification: ICertification
  formGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    description: new FormControl(null),
    ownerId: new FormControl(null)
  })

  private refresh$ = new BehaviorSubject<void>(null)

  public readonly certifications$ = this.refresh$.pipe(switchMap(() => this.certificationService.getAll(['owner'])))
  public readonly users$ = this.userService
    .getAll()
    .pipe(
      catchError((err) => {
        return from(this.userService.getMe()).pipe(map((user) => [user]))
      }),
      map((users) => users.map((user) => ({ caption: userLabel(user), key: user.id }))))

  async createCertification() {
    try {
      await firstValueFrom(
        this.certificationService.create({
          name: 'New certification'
        })
      )

      this.refresh$.next()
      this._toastrService.success('PAC.Certification.CreateCertification', {Default: 'Create Certification'})
    } catch (err) {
      this._toastrService.error(err)
    }
  }

  async removeCertification(certification: ICertification) {
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: certification.name } }).afterClosed()
    )
    if (confirm) {
      try {
        await firstValueFrom(this.certificationService.delete(certification.id))

        this.refresh$.next()
        this._toastrService.success('PAC.Certification.DeleteCertification', {Default: 'Delete Certification'})
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }

  async editCertification(certification: ICertification) {
    this.certification = certification
    this.formGroup.patchValue(certification)
    this._cdr.detectChanges()
  }

  async onSubmit() {
    try {
      await firstValueFrom(
        this.certificationService.update(this.certification.id, {
          ...this.formGroup.value
        })
      )

      this.refresh$.next()
      this._toastrService.success('PAC.Certification.UpdateCertification', {Default: 'Update Certification'})
      this.certification = null
    } catch (err) {
      this._toastrService.error(err)
    }
  }

  cancel(event) {
    event.stopPropagation()
    event.preventDefault()
    this.certification = null
  }
}
