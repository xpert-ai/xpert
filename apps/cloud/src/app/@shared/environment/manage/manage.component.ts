import {
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardInputDirective,
  ZardSelectImports,
  XpI18nPipe,
  XpDialogActionGroupDirective,
  linkedModel,
  injectConfirmDelete,
  injectConfirmUnique,
  effectAction
} from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

import { Component, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  EnvironmentService,
  getErrorMessage,
  IEnvironment,
  injectToastr,
  OrderTypeEnum,
  TEnvironmentVariable
} from '@cloud/app/@core'

import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { BehaviorSubject, Observable, pipe } from 'rxjs'
import { combineLatestWith, debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import { VariableTypeOptions } from '../types'

const AutoSaveDebounceTime = 1000

@Component({
  selector: 'xpert-environment-manage',
  standalone: true,
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    XpI18nPipe,
    XpDialogActionGroupDirective,
    FormsModule,
    TranslateModule
  ],
  templateUrl: './manage.component.html'
})
export class XpertEnvironmentManageComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ workspaceId: string }>(DIALOG_DATA)
  readonly environmentService = inject(EnvironmentService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly confirmName = injectConfirmUnique()
  readonly confirmDelete = injectConfirmDelete()

  readonly workspaceId = signal(this.#data.workspaceId)
  readonly loading = signal(false)
  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly #environments = derivedFrom(
    [this.workspaceId],
    pipe(
      combineLatestWith(this.#refresh$),
      tap(() => this.loading.set(true)),
      switchMap(([[workspaceId]]) =>
        this.environmentService.getAllInOrg({
          where: {
            workspaceId
          },
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      ),
      tap(() => this.loading.set(false)),
      map(({ items }) => items),
      startWith([] as IEnvironment[])
    )
  )

  readonly environments = linkedModel({
    initialValue: null,
    compute: () => this.#environments(),
    update: () => {}
  })

  readonly environmentId = signal<string>(null)
  readonly environment = linkedModel({
    initialValue: null,
    compute: () => this.environments()?.find((_) => _.id === this.environmentId()),
    update: (value) => {
      this.environments.update((state) => {
        const index = state.findIndex((_) => _.id === this.environmentId())
        if (index > -1) {
          state[index] = {
            ...state[index],
            ...value
          }
        }
        return [...state]
      })
      this.dirty.set(true)
      this.saveEnvironment(value)
    }
  })

  readonly VariableTypeOptions = VariableTypeOptions

  // Editing env
  readonly editing = signal(false)
  readonly dirty = signal(false)
  readonly environmentName = model('')

  constructor() {
    effect(() => {
      if (!this.environment() && this.environments()?.length) {
        this.environmentId.set(this.environments().find((_) => _.isDefault)?.id)
      }
    })
  }

  addEnvironment() {
    this.confirmName({}, (name: string) => {
      this.loading.set(true)
      return this.environmentService.create({
        workspaceId: this.workspaceId(),
        name,
        isDefault: !this.environments()?.length
      })
    }).subscribe({
      next: (env) => {
        this.loading.set(false)
        this.#refresh$.next()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  setDefault(env: IEnvironment) {
    this.loading.set(true)
    this.environmentService.setDefault(env.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.#refresh$.next()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  setEnvironment(env: IEnvironment) {
    this.environmentId.set(env.id)
  }

  addVar() {
    this.environment.update((env) => {
      return {
        ...env,
        variables: [
          ...(env.variables ?? []),
          {
            name: '',
            value: '',
            type: 'default'
          }
        ]
      }
    })
  }

  updateVar(index: number, value: Partial<TEnvironmentVariable>) {
    this.environment.update((env) => {
      env.variables[index] = {
        ...env.variables[index],
        ...value
      }
      return {
        ...env,
        variables: [...env.variables]
      }
    })
  }

  removeVar(index: number) {
    this.environment.update((env) => {
      env.variables.splice(index, 1)
      return {
        ...env,
        variables: [...env.variables]
      }
    })
  }

  _saveEnvironment(entity: Partial<IEnvironment>) {
    this.loading.set(true)
    this.environmentService.update(this.environment().id, entity).subscribe({
      next: () => {
        this.loading.set(false)
        this.dirty.set(false)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  saveEnvironment = effectAction((origin: Observable<IEnvironment>) => {
    return origin.pipe(
      debounceTime(AutoSaveDebounceTime),
      tap((env) => this._saveEnvironment(env))
    )
  })

  async delete() {
    this.confirmDelete(
      {
        value: this.environment().name,
        information: await this.#translate.instant('XP.Environment.DeleteEnv', {
          Default: 'Delete the environment and all its environment variables'
        })
      },
      this.environmentService.delete(this.environment().id)
    ).subscribe({
      next: () => {
        this.environments.update((envs) => envs.filter((_) => _.id !== this.environment().id))
        this.environmentId.set(this.environments()[0]?.id)
      }
    })
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.editing.set(false)
      this.environment.update((env) => ({ ...env, name: this.environmentName() }))
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      this.editing.set(false)
      this.environmentName.set(this.environment().name)
    }
  }

  close() {
    this.#dialogRef.close()
  }
}
