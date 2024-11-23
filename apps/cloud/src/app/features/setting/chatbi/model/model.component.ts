import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { IsDirty } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { omit } from 'lodash-es'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { EMPTY, map, of, pipe, startWith, switchMap } from 'rxjs'
import { ChatBIModelService, XpertService, IChatBIModel, IntegrationService, ToastrService, routeAnimations } from '../../../../@core'
import { IntegrationListComponent, MaterialModule, UpsertEntityComponent } from '../../../../@shared'
import { ChatBIModelsComponent } from '../models/models.component'

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
    MaterialModule,
    NgmCommonModule,
    IntegrationListComponent
  ],
  animations: [routeAnimations]
})
export class ChatBIModelComponent extends UpsertEntityComponent<IChatBIModel> implements IsDirty {
  DisplayBehaviour = DisplayBehaviour

  readonly modelsService = inject(SemanticModelServerService)
  readonly chatbiModelService = inject(ChatBIModelService)
  readonly roleService = inject(XpertService)
  readonly integrationService = inject(IntegrationService)
  readonly _toastrService = inject(ToastrService)
  readonly fb = inject(FormBuilder)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly modelsComponent = inject(ChatBIModelsComponent)

  readonly paramId = injectParams('id')

  readonly chatbiModel = derivedFrom(
    [this.paramId],
    pipe(switchMap(([id]) => (id ? this.chatbiModelService.getOneById(id, { relations: ['roles', 'integrations'] }) : EMPTY))),
    {
      initialValue: null
    }
  )

  readonly formGroup = this.fb.group({
    modelId: new FormControl<string>(null),
    entity: new FormControl(null),
    entityCaption: new FormControl(null),
    entityDescription: new FormControl(null),
    roles: new FormControl(null),
    integrations: new FormControl(null),
  })

  get roles() {
    return this.formGroup.get('roles').value
  }
  set roles(value) {
    this.formGroup.patchValue({ roles: value })
    this.formGroup.get('roles').markAsDirty()
  }

  get integrations() {
    return this.formGroup.get('integrations').value
  }
  set integrations(value) {
    this.formGroup.patchValue({ integrations: value })
    this.formGroup.get('integrations').markAsDirty()
  }

  readonly modelId = toSignal(this.formGroup.get('modelId').valueChanges.pipe(startWith(this.formGroup.value?.modelId)))

  readonly models = toSignal(
    this.modelsService
      .getMy()
      .pipe(map((models) => models.map((item) => ({ key: item.id, caption: item.name, value: item }))))
  )

  readonly selectedModel = computed(() => this.models()?.find((item) => item.key === this.modelId()))

  readonly entities = computed(() =>
    this.selectedModel()?.value?.schema?.cubes.map((cube) => ({ key: cube.name, caption: cube.caption, value: cube }))
  )

  readonly cubeName = toSignal(this.formGroup.get('entity').valueChanges.pipe(startWith(this.formGroup.value?.entity)))
  readonly selectedCube = computed(() => this.entities()?.find((item) => item.key === this.cubeName())?.value)
  readonly roleList = toSignal(this.roleService.getAllInOrg().pipe(map(({ items }) => items)))
  readonly integrationList = toSignal(this.integrationService.getAllInOrg().pipe(map(({ items }) => items)))

  readonly loading = signal(true)

  constructor(chatbiModelService: ChatBIModelService) {
    super(chatbiModelService)

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
    const entity = omit(this.formGroup.value, 'roles')
    ;(this.paramId()
      ? this.update(this.paramId(), entity).pipe(map(() => this.paramId()))
      : this.save(entity).pipe(map((model) => model.id))
    )
      .pipe(
        switchMap((modelId) =>
          this.formGroup.get('roles').dirty
            ? this.chatbiModelService.updateRoles(
                modelId,
                this.roles.map(({ id }) => id)
              )
            : of(null)
        )
      )
      .subscribe(() => {
        this.formGroup.markAsPristine()
        this.close()
      })
  }

  close(refresh = false) {
    this.modelsComponent.refresh()
    this.router.navigate(['../'], { relativeTo: this.route })
  }
}
