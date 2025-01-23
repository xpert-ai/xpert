import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { IsDirty } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { catchError, EMPTY, map, of, pipe, startWith, switchMap } from 'rxjs'
import { ChatBIModelService, getErrorMessage, injectToastr, OrderTypeEnum, routeAnimations } from '../../../../@core'
import { ChatBIModelsComponent } from '../models/models.component'
import { HttpErrorResponse } from '@angular/common/http'

@Component({
  standalone: true,
  selector: 'pac-settings-chatbi-model',
  templateUrl: './model.component.html',
  styleUrls: ['./model.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    NgmCommonModule,
    MatButtonModule,
    MatInputModule
  ],
  animations: [routeAnimations]
})
export class ChatBIModelComponent implements IsDirty {
  DisplayBehaviour = DisplayBehaviour

  readonly modelsService = inject(SemanticModelServerService)
  readonly chatbiModelService = inject(ChatBIModelService)
  readonly fb = inject(FormBuilder)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly #toastr = injectToastr()
  readonly modelsComponent = inject(ChatBIModelsComponent)

  readonly paramId = injectParams('id')

  readonly chatbiModel = derivedFrom(
    [this.paramId],
    pipe(switchMap(([id]) => (id ? this.chatbiModelService.getOneById(id) : EMPTY))),
    {
      initialValue: null
    }
  )

  readonly formGroup = this.fb.group({
    modelId: new FormControl<string>(null),
    entity: new FormControl(null),
    entityCaption: new FormControl(null),
    entityDescription: new FormControl(null)
  })

  readonly modelId = toSignal(this.formGroup.get('modelId').valueChanges.pipe(startWith(this.formGroup.value?.modelId)))

  readonly models = toSignal(
    this.modelsService
      .getMyModels({
        select: ['id', 'name', 'description'],
        order: {
          updatedAt: OrderTypeEnum.DESC
        }
      })
      .pipe(map((models) => models.map((item) => ({ key: item.id, caption: item.name, value: item }))))
  )

  readonly selectedModel = computed(() => this.models()?.find((item) => item.key === this.modelId()))

  readonly entities = derivedAsync(() => {
    return this.modelId()
      ? this.modelsService.getCubes(this.modelId()).pipe(
          map((cubes) => cubes.map((cube) => ({ key: cube.name, caption: cube.caption, value: cube }))),
          catchError((err) => {
            this.#toastr.error(getErrorMessage(err))
            return of(null)
          })
        )
      : of(null)
  })

  readonly cubeName = toSignal(this.formGroup.get('entity').valueChanges.pipe(startWith(this.formGroup.value?.entity)))
  readonly selectedCube = computed(() => this.entities()?.find((item) => item.key === this.cubeName())?.value)

  readonly loading = signal(true)

  constructor() {
    effect(
      () => {
        if (this.selectedCube()) {
          if (this.formGroup.dirty) {
            this.formGroup.patchValue({
              entityCaption: this.selectedCube().caption,
              entityDescription: this.selectedCube().description
            })
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.chatbiModel()) {
          this.formGroup.patchValue(this.chatbiModel())
        } else {
          this.formGroup.reset()
        }
        this.formGroup.markAsPristine()
        this.loading.set(false)
      },
      { allowSignalWrites: true }
    )
  }

  isDirty(): boolean {
    return this.formGroup.dirty
  }

  saveAll() {
    this.loading.set(true)
    const entity = { ...this.formGroup.value }
    ;(this.paramId()
      ? this.chatbiModelService.update(this.paramId(), entity).pipe(map(() => this.paramId()))
      : this.chatbiModelService.create(entity).pipe(map((model) => model.id))
    ).subscribe({
      next: () => {
        this.loading.set(false)
        this.formGroup.markAsPristine()
        this.close()
      },
      error: (err) => {
        this.loading.set(false)
        if ((<HttpErrorResponse>err).error.code === "23505") {
          this.#toastr.error('PAC.ChatBI.ModelExists', null, {Default: 'Model already exists'})
        } else {
          this.#toastr.error(getErrorMessage(err))
        }
      }
    })
  }

  close(refresh = false) {
    this.modelsComponent.refresh()
    this.router.navigate(['../'], { relativeTo: this.route })
  }
}
