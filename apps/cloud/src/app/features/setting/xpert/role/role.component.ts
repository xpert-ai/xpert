import { CdkListboxModule } from '@angular/cdk/listbox'
import { Component, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour, nonBlank } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { distinctUntilChanged, filter, map, switchMap } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgebase,
  IXpertRole,
  KnowledgebaseService,
  OrderTypeEnum,
  TAvatar,
  ToastrService,
  XpertAPIService,
  XpertToolsetService
} from '../../../../@core'
import { KnowledgebaseListComponent, ToolsetListComponent } from '../../../../@shared/copilot'
import { XpertRolesComponent } from '../roles/roles.component'
import { UpsertEntityComponent } from 'apps/cloud/src/app/@shared/common'
import { AvatarEditorComponent } from 'apps/cloud/src/app/@shared/files'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'


@Component({
  standalone: true,
  selector: 'pac-settings-xpert-role',
  templateUrl: './role.component.html',
  styleUrls: ['./role.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    MaterialModule,
    CdkListboxModule,
    FormsModule,
    ReactiveFormsModule,
    NgmCommonModule,
    AvatarEditorComponent,
    KnowledgebaseListComponent,
    ToolsetListComponent
  ]
})
export class XpertRoleComponent extends UpsertEntityComponent<IXpertRole> {
  DisplayBehaviour = DisplayBehaviour

  readonly roleService = inject(XpertAPIService)
  readonly toolsetService = inject(XpertToolsetService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly rolesComponent = inject(XpertRolesComponent)
  readonly _toastrService = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly dialog = inject(MatDialog)
  readonly fb = inject(FormBuilder)
  readonly paramId = injectParams('id')

  readonly loading = signal(true)

  readonly xpertRole = signal<IXpertRole>(null)

  readonly formGroup = this.fb.group({
    id: new FormControl<string>(null),
    avatar: new FormControl<TAvatar>(null),
    name: new FormControl<string>(null),
    title: new FormControl(null),
    titleCN: new FormControl(null),
    description: new FormControl(null),
    prompt: new FormControl(null),
    starters: new FormArray([
      new FormControl(null),
      new FormControl(null),
      new FormControl(null),
      new FormControl(null)
    ]),
    knowledgebases: new FormControl(null),
    toolsets: new FormControl(null),
    options: new FormControl(null)
  })
  get knowledgebases() {
    return this.formGroup.get('knowledgebases').value
  }
  set knowledgebases(value) {
    this.formGroup.patchValue({ knowledgebases: value })
    this.formGroup.markAsDirty()
  }
  get toolsets() {
    return this.formGroup.get('toolsets').value
  }
  set toolsets(value) {
    this.formGroup.patchValue({ toolsets: value })
    this.formGroup.markAsDirty()
  }
  get options() {
    return this.formGroup.get('options') as FormControl
  }

  readonly knowledgebaseList = toSignal(
    this.knowledgebaseService.getAllInOrg({ order: { createdAt: OrderTypeEnum.DESC } }).pipe(map(({ items }) => items))
  )
  // readonly knowledgebases = model<IKnowledgebase[]>([])

  // readonly knowledgebasesDirty = computed(() => {
  //   return (
  //     this.knowledgebases().length !== this.xpertRole()?.knowledgebases?.length ||
  //     this.knowledgebases().some((kb) => !this.xpertRole().knowledgebases.some((item) => item.id === kb.id))
  //   )
  // })
  readonly toolsetList = toSignal(this.toolsetService.getAllInOrg().pipe(map(({ items }) => items)))

  private roleSub = toObservable(this.paramId)
    .pipe(
      distinctUntilChanged(),
      filter(nonBlank),
      switchMap((id) => this.roleService.getById(id, { relations: ['knowledgebases', 'toolsets'] })),
      takeUntilDestroyed()
    )
    .subscribe((role) => {
      this.xpertRole.set(role)
    })

  constructor(roleService: XpertAPIService) {
    super(roleService)

    effect(
      () => {
        if (this.xpertRole()) {
          this.formGroup.patchValue({
            ...this.xpertRole(),
            options: this.xpertRole().options ? JSON.stringify(this.xpertRole().options, null, 2) : null
          })
          // this.knowledgebases.set([...(this.xpertRole().knowledgebases ?? [])])
        } else {
          this.formGroup.reset()
        }
        this.formGroup.markAsPristine()
        this.loading.set(false)
      },
      { allowSignalWrites: true }
    )
  }

  close(refresh = false) {
    if (refresh) {
      this.rolesComponent.refresh()
    }
    this.#router.navigate(['../'], { relativeTo: this.#route })
  }

  saveAll() {
    const entity = {
      ...this.formGroup.value,
      options: this.formGroup.value.options ? JSON.parse(this.formGroup.value.options) : null,
      knowledgebases: this.formGroup.value.knowledgebases.map((item) => ({ id: item.id })),
      toolsets: this.formGroup.value.toolsets.map((item) => ({ id: item.id }))
    }
    this.upsert(entity).subscribe({
      next: () => {
        this.close(true)
      },
      error: (error) => {
        this._toastrService.error(getErrorMessage(error))
      }
    })
  }

  compareId(a: IKnowledgebase, b: IKnowledgebase): boolean {
    return a?.id === b?.id
  }
}
