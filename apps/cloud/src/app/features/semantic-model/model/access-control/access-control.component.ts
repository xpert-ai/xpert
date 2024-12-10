import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, TemplateRef, ViewChild, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatListModule } from '@angular/material/list'
import { ActivatedRoute, Router } from '@angular/router'
import { IModelRole } from '@metad/contracts'
import { NgmDisplayBehaviourComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { injectCopilotCommand } from '@metad/copilot-angular'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { uuid } from 'apps/cloud/src/app/@core'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom, map } from 'rxjs'
import { SemanticModelService } from '../model.service'
import { AccessControlStateService } from './access-control.service'
import { ModelComponent } from '../model.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

@Component({
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
  readonly #dialog = inject(MatDialog)
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

  #newDialogRef: MatDialogRef<any, any>

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
  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #roleCommand = injectCopilotCommand({
    name: 'role',
    description: this.translateService.instant('PAC.MODEL.Copilot.Examples.CreateNewRole', {
      Default: 'Describe the role you want to create'
    }),
    systemPrompt: async () => `Create or edit a role. 如何未提供 cube 信息，请先选择一个 cube`,
    actions: [
      // injectMakeCopilotActionable({
      //   name: 'select_cube',
      //   description: 'Select a cube',
      //   argumentAnnotations: [],
      //   implementation: async () => {
      //     const result = await firstValueFrom(
      //       this.#dialog.open(CubeSelectorComponent, { data: this.cubes() }).afterClosed()
      //     )
      //     if (result) {
      //       const entityType = await firstValueFrom(this.#modelService.selectEntityType(result[0]))
      //       return {
      //         id: nanoid(),
      //         name: 'select_cube',
      //         role: 'function',
      //         content: `${calcEntityTypePrompt(entityType)}`
      //       }
      //     }
      //   }
      // }),
      // injectMakeCopilotActionable({
      //   name: 'new-role',
      //   description: 'Create a new role',
      //   argumentAnnotations: [
      //     {
      //       name: 'role',
      //       type: 'object',
      //       description: 'Role defination',
      //       properties: zodToAnnotations(RoleSchema),
      //       required: true
      //     }
      //   ],
      //   implementation: async (role: any) => {
      //     role.key = nanoid()
      //     this.#logger.debug(`The new role in function call is:`, role)
      //     this.#accessControlState.addRole(role)

      //     // Navigate to the new role
      //     this.#router.navigate([role.key], { relativeTo: this.#route })

      //     return `创建成功`
      //   }
      // })
    ]
  })

  trackByKey(index: number, item: IModelRole) {
    return item.key
  }

  openCreate() {
    this.#newDialogRef = this.#dialog.open(this.creatTmpl)
  }

  async onCreate() {
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
  template: `<header mat-dialog-title cdkDrag cdkDragRootElement=".cdk-overlay-pane" cdkDragHandle>
      <span style="pointer-events: none;">{{ '选择数据集' }}</span>
    </header>

    <div mat-dialog-content class="flex-1">
      <ngm-search class="m-2" [formControl]="search"></ngm-search>

      <mat-selection-list [(ngModel)]="value" [multiple]="false" class="overflow-auto">
        @for (item of options(); track item.key) {
        <mat-list-option [value]="item.key">
          <ngm-display-behaviour [option]="item" [highlight]="search.value"></ngm-display-behaviour>
        </mat-list-option>
        }
      </mat-selection-list>
    </div>

    <div mat-dialog-actions align="end">
      <div ngmButtonGroup>
        <button mat-button mat-dialog-close cdkFocusInitial>Cancel</button>
        <button mat-raised-button color="accent" (click)="onApply()">Apply</button>
      </div>
    </div>`,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    NgmSearchComponent,
    NgmDisplayBehaviourComponent,
    ButtonGroupDirective
  ]
})
export class CubeSelectorComponent {
  readonly #dialogRef = inject(MatDialogRef)
  readonly data = inject<ISelectOption[]>(MAT_DIALOG_DATA)

  readonly search = new FormControl('')
  readonly searchText = toSignal(this.search.valueChanges, { initialValue: '' })
  readonly options = computed(() => {
    const text = this.searchText()?.toLowerCase()
    return text ? this.data.filter((item) => item.caption.includes(text)) : this.data
  })

  value = []

  onApply() {
    this.#dialogRef.close(this.value)
  }
}
