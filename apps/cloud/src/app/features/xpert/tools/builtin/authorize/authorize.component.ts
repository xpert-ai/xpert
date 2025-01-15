import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialogModule } from '@angular/material/dialog'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { routeAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  CredentialsType,
  getErrorMessage,
  IXpertToolset,
  TagCategoryEnum,
  ToastrService,
  TToolCredentials,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { XpertToolBuiltinCredentialComponent } from './credential/credential.component'
import { isNil } from 'lodash-es'
import { MatInputModule } from '@angular/material/input'
import { TextFieldModule } from '@angular/cdk/text-field'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatDialogModule,
    MatTooltipModule,
    MatSlideToggleModule,
    NgmI18nPipe,
    NgmSpinComponent,
    MatInputModule,
    TextFieldModule,

    XpertToolBuiltinCredentialComponent
  ],
  selector: 'xpert-tool-builtin-authorize',
  templateUrl: './authorize.component.html',
  styleUrl: 'authorize.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertToolBuiltinAuthorizeComponent {
  eTagCategoryEnum = TagCategoryEnum
  eCredentialsType = CredentialsType

  readonly toolsetService = inject(XpertToolsetService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)

  readonly workspaceId = input<string>()
  readonly provider = input<string>()
  readonly toolset = model<IXpertToolset>()
  readonly credentials = model<Record<string, unknown>>(null)
  readonly close = output<boolean>()

  readonly loading = signal(false)

  readonly credentialsSchema = derivedAsync(() => {
    if (this.provider()) {
      return this.toolsetService.getBuiltinCredentialsSchema(this.provider())
    }
    return null
  })

  readonly toolsetId = computed(() => this.toolset()?.id)
  readonly toolsetCredentials = derivedAsync(() => {
    return this.toolsetId() ? this.toolsetService.getCredentials(this.toolsetId()) : of(null)
  })

  readonly toolsetName = model<string>()
  readonly toolsetDescription = model<string>()
  readonly #credentials = signal<TToolCredentials>(null)
  readonly credentialsValue = computed(() => this.#credentials())

  readonly credentialsInvalid = computed(() => {
    return this.credentialsSchema()?.filter((item) => item.required).some((_) => isNil(this.#credentials()?.[_.name]))
  })

  constructor() {
    effect(
      () => {
        if (this.credentialsSchema() && this.credentialsSchema().length === 0) {
          this.#credentials.set({})
          this.save()
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.toolsetCredentials()) {
        this.#credentials.set(this.toolsetCredentials())
      }
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.toolset()) {
        this.toolsetName.set(this.toolset().name)
        this.toolsetDescription.set(this.toolset().description)
      }
    }, { allowSignalWrites: true })
  }

  getCredential(name: string) {
    return this.#credentials()?.[name]
  }

  setCredential(name: keyof TToolCredentials, value: string | number | boolean) {
    this.#credentials.update((state) => ({
      ...(state ?? {}),
      [name]: value
    }))
  }

  remove() {
    this.loading.set(true)
    this.toolsetService.delete(this.toolsetId()).subscribe({
      next: () => {
        this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
        this.loading.set(false)
        this.credentials.set(null)
        this.toolset.set(null)
        this.close.emit(true)
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
        this.loading.set(false)
      }
    })
  }

  cancel() {
    this.close.emit(false)
  }

  save() {
    this.loading.set(true)
    const entity: Partial<IXpertToolset> = {
      workspaceId: this.workspaceId(),
      name: this.toolsetName(),
      description: this.toolsetDescription(),
      credentials: this.#credentials()
    }
    if (this.toolsetId()) {
      entity.id = this.toolsetId()
    }
    this.toolsetService.createBuiltinToolsetInstance(this.provider(), entity)
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (toolset) => {
          if (this.toolsetId()) {
            this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' }, this.toolset().type)
          } else {
            this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created successfully' }, toolset.type)
          }
          if (toolset) {
            this.toolset.update((state) => ({
              ...(state ?? {}),
              ...toolset
            }))
          }
          this.loading.set(false)
          this.credentials.set(this.#credentials())
          this.close.emit(true)
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
          this.loading.set(false)
        }
      })
  }
}
