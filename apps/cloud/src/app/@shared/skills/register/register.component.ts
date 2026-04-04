import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { getErrorMessage, ISkillRepository } from '@cloud/app/@core'
import { JsonSchemaObjectType } from '@metad/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardInputDirective, ZardSelectImports } from '@xpert-ai/headless-ui'
import { finalize, startWith } from 'rxjs'
import { injectToastr, SkillRepositoryService } from '../../../@core/services'
import { JSONSchemaFormComponent } from '../../forms'

@Component({
  standalone: true,
  selector: 'xp-skill-repository-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    ZardInputDirective,
    ...ZardSelectImports,
    JSONSchemaFormComponent
  ]
})
export class XpertSkillRepositoryRegisterComponent {
  readonly fb = inject(FormBuilder)
  readonly toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly repositoryService = inject(SkillRepositoryService)
  readonly #dialogRef = inject(DialogRef<string | null>)
  readonly #data = inject<{ repository?: ISkillRepository } | null>(DIALOG_DATA, { optional: true })

  readonly savingRepo = signal(false)
  readonly repository = signal<ISkillRepository | null>(this.#data?.repository ?? null)

  readonly repositoryForm = this.fb.nonNullable.group({
    provider: ['', Validators.required],
    name: ['', Validators.required],
    options: [null],
    credentials: [null]
  })

  // Source Strategies
  readonly sourceStrategies = toSignal(this.repositoryService.sourceStrategies$, { initialValue: [] })
  readonly selectedSourceStrategy = toSignal(
    this.repositoryForm.get('provider').valueChanges.pipe(startWith(this.repositoryForm.get('provider').value))
  )
  readonly activeSourceStrategy = computed(
    () => this.sourceStrategies().find((strategy) => strategy.name === this.selectedSourceStrategy()) ?? null
  )
  readonly configSchema = computed<JsonSchemaObjectType | null>(() => this.activeSourceStrategy()?.configSchema ?? null)
  readonly credentialSchema = computed<JsonSchemaObjectType | null>(
    () => this.activeSourceStrategy()?.credentialSchema ?? null
  )

  constructor() {
    effect(
      () => {
        const repository = this.repository()
        if (repository) {
          this.repositoryForm.patchValue({
            provider: repository.provider ?? '',
            name: repository.name ?? '',
            options: repository.options ?? null,
            credentials: repository.credentials ?? null
          })
          this.repositoryForm.get('provider').disable({ emitEvent: false })
          return
        }

        const strategies = this.sourceStrategies()
        if (strategies.length && !this.selectedSourceStrategy()) {
          this.repositoryForm.get('provider').setValue(strategies[0].name)
        }
      },
      { allowSignalWrites: true }
    )
  }

  registerRepository() {
    if (!this.selectedSourceStrategy()) {
      this.toastr.error(
        this.#translate.instant('Pro.SelectSourceStrategyValidation', {
          Default: 'Please select a source strategy'
        })
      )
      return
    }

    const formValue = this.repositoryForm.getRawValue()

    this.savingRepo.set(true)
    this.repositoryService
      .register({
        id: this.repository()?.id,
        ...formValue
      })
      .pipe(finalize(() => this.savingRepo.set(false)))
      .subscribe({
        next: (repo) => {
          this.toastr.success(
            this.#translate.instant(this.repository() ? 'Pro.RepositoryConfigUpdated' : 'Pro.RepositoryRegistered', {
              Default: this.repository() ? 'Repository config updated' : 'Repository registered'
            })
          )
          this.#dialogRef.close(repo.id)
        },
        error: (err) => this.toastr.error(getErrorMessage(err))
      })
  }
}
