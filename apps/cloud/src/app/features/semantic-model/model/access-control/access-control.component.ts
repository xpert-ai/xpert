import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'

import { Component, TemplateRef, ViewChild, computed, inject, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms'

import { ActivatedRoute, Router } from '@angular/router'
import { IModelRole } from '@metad/contracts'
import { NgmDisplayBehaviourComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { buildListboxOptions, ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { uuid } from 'apps/cloud/src/app/@core'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom, map } from 'rxjs'
import { SemanticModelService } from '../model.service'
import { AccessControlStateService } from './access-control.service'
import { ModelComponent } from '../model.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogModule, ZardDialogRef, ZardDialogService } from '@xpert-ai/headless-ui'

@Component({
  standalone: false,
  selector: 'pac-model-access-control',
  templateUrl: 'access-control.component.html',
  providers: [AccessControlStateService],
  host: {
    class: 'pac-model-access-control'
  },
  styles: [
    `
      :host {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    `
  ]
})
export class AccessControlComponent extends TranslationBaseComponent {
  readonly #accessControlState = inject(AccessControlStateService)
  readonly #logger = inject(NGXLogger)
  readonly #dialog = inject(ZardDialogService)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #modelService = inject(SemanticModelService)
  readonly #model = inject(ModelComponent)

  @ViewChild('creatTmpl') creatTmpl: TemplateRef<any>

  // Selectors

  readonly modelSideMenuOpened= this.#model.sideMenuOpened
  creatFormGroup = new FormGroup({
    name: new FormControl('', [Validators.required, this.forbiddenNameValidator()]),
    type: new FormControl(),
    options: new FormControl()
  })
  get name() {
    return this.creatFormGroup.get('name')
  }

  role: IModelRole

  get roles() {
    return this.#accessControlState.roles
  }

  #newDialogRef: ZardDialogRef<any, any>

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly cubes = toSignal(
    this.#modelService.cubeStates$.pipe(
      map((states) =>
        states.map((state) => ({
          key: state.name,
          caption: state.caption
        }))
      )
    )
  )

  trackByKey(index: number, item: IModelRole) {
    return item.key
  }

  openCreate() {
    this.#newDialogRef = this.#dialog.open(this.creatTmpl)
  }

  onCreate() {
    const key = uuid()
    this.#accessControlState.addRole({
      ...this.creatFormGroup.value,
      key
    } as IModelRole)

    // Navigate to the new role
    this.#router.navigate([key], { relativeTo: this.#route })
    this.creatFormGroup.reset()
    this.#newDialogRef?.close()
    this.#newDialogRef = null
  }

  remove(role: IModelRole) {
    this.#accessControlState.removeRole(role.key)
    if (this.roles.length) {
      this.#router.navigate([this.roles[0].key], { relativeTo: this.#route })
    } else {
      this.#router.navigate(['overview'], { relativeTo: this.#route })
    }
  }

  drop(event: CdkDragDrop<IModelRole[]>) {
    this.#accessControlState.moveRoleInArray(event)
  }

  forbiddenNameValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const index = this.roles?.findIndex((item) => item.name === control.value)
      const forbidden = index > -1
      return forbidden ? { forbiddenName: { value: control.value } } : null
    }
  }

  async duplicate(role: IModelRole) {
    this.creatFormGroup.setValue({
      name: role.name,
      type: role.type,
      options: cloneDeep(role.options)
    })
    await this.openCreate()
  }

  openSideMenu() {
    this.modelSideMenuOpened.set(true)
  }
}

@Component({
  standalone: true,
  selector: 'pac-cube-selector',
  template: `<header xpDialogTitle cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
      <span style="pointer-events: none;">{{ '选择数据集' }}</span>
    </header>

    <div xpDialogContent class="flex-1">
      <ngm-search class="m-2" [formControl]="search"></ngm-search>

      <ul
        class="ngm-cdk-listbox overflow-auto"
        cdkListbox
        [cdkListboxValue]="value()"
        (cdkListboxValueChange)="value.set([...$event.value])"
      >
        @for (item of options(); track item.key) {
        <li class="ngm-cdk-option" [cdkOption]="item.value ?? item.key">
          <ngm-display-behaviour [option]="toDisplayOption(item)" [highlight]="search.value"></ngm-display-behaviour>
        </li>
        }
      </ul>
    </div>

    <div xpDialogActions align="end">
      <div ngmButtonGroup>
        <button z-button zType="ghost" xpDialogClose cdkFocusInitial>Cancel</button>
        <button z-button zType="default" (click)="onApply()">Apply</button>
      </div>
    </div>`,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkListboxModule,
    ZardDialogModule,
    ZardButtonComponent,
    NgmSearchComponent,
    NgmDisplayBehaviourComponent,
    ButtonGroupDirective
]
})
export class CubeSelectorComponent {
  readonly #dialogRef = inject(ZardDialogRef)
  readonly data = inject<ISelectOption[]>(Z_MODAL_DATA)

  readonly search = new FormControl('')
  readonly searchText = toSignal(this.search.valueChanges, { initialValue: '' })
  readonly value = model<string[]>([])
  readonly options = computed(() => {
    const text = this.searchText()?.toLowerCase()
    const options = (text ? this.data.filter((item) => item.caption?.toLowerCase().includes(text)) : this.data).map(
      (item) => ({
        ...item,
        value: item.value ?? item.key
      })
    )
    return buildListboxOptions(options, this.value())
  })

  onApply() {
    this.#dialogRef.close(this.value())
  }

  toDisplayOption(item: { key?: string; value: unknown; label?: unknown }) {
    return {
      key: item.key ?? `${item.value ?? ''}`,
      value: item.value,
      caption: typeof item.label === 'string' ? item.label : `${item.value ?? ''}`
    }
  }
}
