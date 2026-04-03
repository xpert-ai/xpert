import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgmConfirmDeleteService } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import { UsersService } from '@metad/cloud/state'
import { BehaviorSubject, catchError, firstValueFrom, from, map, shareReplay, switchMap } from 'rxjs'
import { CertificationService, ICertification, ToastrService } from '../../../@core'
import { SharedUiModule } from '../../../@shared/ui.module'
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
    SharedUiModule,
    ReactiveFormsModule,
    ButtonGroupDirective,
    DensityDirective,
    ...ZardSelectImports,
    UserProfileInlineComponent
  ]
})
export class CertificationComponent {
  private readonly certificationService = inject(CertificationService)
  private readonly userService = inject(UsersService)
  readonly #translate = inject(TranslateService)
  private readonly _toastrService = inject(ToastrService)
  private readonly _confirmDelete = inject(NgmConfirmDeleteService)
  private readonly _cdr = inject(ChangeDetectorRef)

  certification: ICertification | null = null
  readonly noOwnerValue = '__none__'
  readonly userLabel = userLabel
  formGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    description: new FormControl(null),
    ownerId: new FormControl(null)
  })
  readonly formControls = this.formGroup.controls

  private refresh$ = new BehaviorSubject<void>(void 0)

  public readonly certifications$ = this.refresh$.pipe(
    switchMap(() => this.certificationService.getAll(['owner'])),
    shareReplay({ bufferSize: 1, refCount: true })
  )
  public readonly users$ = this.userService
    .getAll()
    .pipe(
      catchError((err) => {
        return from(this.userService.getMe()).pipe(map((user) => [user]))
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    )

  async createCertification() {
    try {
      await firstValueFrom(
        this.certificationService.create({
          name: this.#translate.instant('PAC.Certification.DefaultName', { Default: 'New certification' })
        })
      )

      this.refresh$.next()
      this._toastrService.success('PAC.Certification.CreateCertification', {Default: 'Create Certification'})
    } catch (err) {
      this._toastrService.error(err)
    }
  }

  async removeCertification(certification: ICertification) {
    const confirm = await firstValueFrom(this._confirmDelete.confirm({ value: certification.name }))
    if (confirm) {
      try {
        await firstValueFrom(this.certificationService.delete(certification.id))

        if (this.certification?.id === certification.id) {
          this.certification = null
        }
        this.refresh$.next()
        this._toastrService.success('PAC.Certification.DeleteCertification', {Default: 'Delete Certification'})
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }

  async editCertification(certification: ICertification) {
    this.certification = certification
    this.patchCertificationForm(certification)
    this._cdr.detectChanges()
  }

  ownerSelectionValue(): string {
    return this.formControls.ownerId.value ?? this.noOwnerValue
  }

  onOwnerSelectionChange(value: string | number | Array<string | number>) {
    const ownerId =
      !Array.isArray(value) && typeof value === 'string' && value !== this.noOwnerValue ? value : null
    this.formControls.ownerId.setValue(ownerId)
    this.formControls.ownerId.markAsDirty()
    this.formControls.ownerId.markAsTouched()
  }

  async onSubmit() {
    if (!this.certification) {
      return
    }

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

  cancel(event: Event) {
    event.stopPropagation()
    event.preventDefault()
    this.certification = null
  }

  assignedCertificationCount(certifications: ICertification[] | null | undefined): number {
    return certifications?.filter((item) => !!(item.owner?.id || item.ownerId)).length ?? 0
  }

  certificationInitial(certification: ICertification): string {
    return certification.name?.trim()?.charAt(0)?.toUpperCase() || 'C'
  }

  certificationDescription(certification: ICertification): string {
    return (
      certification.description?.trim() ||
      this.#translate.instant('PAC.Certification.EmptyDescription', { Default: 'No description added yet.' })
    )
  }

  certificationOwnerLabel(certification: ICertification | null): string {
    return certification?.owner
      ? userLabel(certification.owner)
      : this.#translate.instant('PAC.Certification.NoOwner', { Default: 'No owner assigned' })
  }

  selectedCertificationName(): string {
    return (
      this.formGroup.getRawValue().name?.trim() ||
      this.certification?.name ||
      this.#translate.instant('PAC.Certification.Untitled', { Default: 'Untitled certification' })
    )
  }

  private patchCertificationForm(certification: ICertification) {
    this.formGroup.reset(
      {
        name: certification.name ?? '',
        description: certification.description ?? null,
        ownerId: certification.ownerId ?? certification.owner?.id ?? null
      },
      { emitEvent: false }
    )
  }
}
