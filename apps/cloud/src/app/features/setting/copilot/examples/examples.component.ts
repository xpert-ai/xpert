import { Component, TemplateRef, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { saveAsYaml, uploadYamlFile } from '@metad/core'
import {
  NgmCommonModule,
  NgmConfirmDeleteComponent,
  NgmConfirmOptionsComponent,
  TableColumn
} from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { AppService } from 'apps/cloud/src/app/app.service'
import { derivedFrom } from 'ngxtension/derived-from'
import { BehaviorSubject, EMPTY, combineLatestWith, map, pipe, switchMap } from 'rxjs'
import {
  AiBusinessRole,
  CopilotExampleService,
  XpertService,
  ICopilotKnowledge,
  IXpertRole,
  LanguagesEnum,
  ToastrService,
  getErrorMessage
} from '../../../../@core'
import { MaterialModule, TranslationBaseComponent, userLabel } from '../../../../@shared'
import { FORMLY_W_1_2 } from '@metad/story/designer'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot-examples',
  templateUrl: './examples.component.html',
  styleUrls: ['./examples.component.scss'],
  imports: [RouterModule, TranslateModule, MaterialModule, FormsModule, ReactiveFormsModule, NgmCommonModule]
})
export class CopilotExamplesComponent extends TranslationBaseComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly exampleService = inject(CopilotExampleService)
  readonly xpertService = inject(XpertService)
  readonly _toastrService = inject(ToastrService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly dialog = inject(MatDialog)
  readonly appService = inject(AppService)

  readonly actionTemplate = viewChild('actionTemplate', { read: TemplateRef })
  readonly vector = viewChild('vector', { read: TemplateRef })

  readonly columns = toSignal<TableColumn[]>(
    this.translateService.stream('PAC.Copilot.Examples').pipe(
      map((i18n) => [
        {
          name: 'vector',
          caption: i18n?.Vectorized || 'Vectorized',
          cellTemplate: this.vector
        },
        {
          name: 'role',
          caption: i18n?.ExpertRole || 'Expert Role'
        },
        {
          name: 'command',
          caption: i18n?.CopilotCommand || 'Copilot Command'
        },
        {
          name: 'updatedBy',
          caption: i18n?.UpdatedBy || 'Updated By',
          pipe: userLabel
        },
        {
          name: 'updatedAt',
          caption: i18n?.UpdatedAt || 'Updated At'
        },
        {
          name: 'input',
          caption: i18n?.Input || 'Input',
          width: '1000px'
        },
        {
          name: 'output',
          caption: i18n?.Output || 'Output',
          width: '1000px'
        },
        {
          name: 'metadata',
          caption: i18n?.Metadata || 'Metadata',
          pipe: (value) => JSON.stringify(value),
          width: '400px'
        },
        {
          name: 'actions',
          caption: i18n?.Actions || 'Actions',
          cellTemplate: this.actionTemplate,
          stickyEnd: true
        }
      ])
    )
  )

  readonly roleFilter = model<AiBusinessRole | string>(null)
  readonly commandFilter = model<string>(null)
  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly items = derivedFrom(
    [this.roleFilter, this.commandFilter],
    pipe(
      combineLatestWith(this.refresh$),
      switchMap(([[role, command]]) =>
        this.exampleService.getAll({
          filter: {
            role,
            command
          },
          relations: ['updatedBy']
        })
      )
    ),
    { initialValue: null }
  )

  readonly lang = this.appService.lang
  readonly refreshFilter$ = new BehaviorSubject<void>(null)
  readonly _roles = toSignal(this.refreshFilter$.pipe(switchMap(() => this.xpertService.getMyCopilots()), map(({items}) => items)))
  readonly roles = computed(() => {
    const lang = this.lang() as LanguagesEnum
    const roles = this._roles()?.map((role) => ({
      ...role,
      title: [LanguagesEnum.Chinese, LanguagesEnum.SimplifiedChinese].includes(lang) ? role.titleCN : role.title
    })) ?? []

    return [
      {
        key: null,
        caption: this.getTranslation('PAC.KEY_WORDS.Default', {Default: 'Default'})
      },
      ...roles.map((role) => ({
        value: role,
        key: role.name,
        caption: role.title || role.name
      }))
    ]
  })

  readonly commands = derivedFrom(
    [this.roleFilter],
    pipe(
      switchMap(([role]) => this.refreshFilter$.pipe(switchMap(() => this.exampleService.getCommands({ role })))),
      map((commands) =>
        commands.map((command) => ({
          key: command,
          caption: command
        }))
      )
    ),
    { initialValue: [] }
  )

  readonly loading = signal(true)

  constructor() {
    super()

    effect(
      () => {
        if (this.items()) {
          this.loading.set(false)
        }
      },
      { allowSignalWrites: true }
    )
  }

  refresh() {
    this.refresh$.next()
  }

  addExample() {
    this.router.navigate(['create'], { relativeTo: this.route })
  }

  editExample(id: string) {
    this.router.navigate([id], { relativeTo: this.route })
  }

  deleteExample(id: string, input: string) {
    this.dialog
      .open(NgmConfirmDeleteComponent, {
        data: {
          value: id,
          information: `${this.getTranslation('PAC.Copilot.Examples.Input', {Default: 'Input'})}: ${input}`
        }
      })
      .afterClosed()
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.exampleService.delete(id)
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this._toastrService.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
          return this.refresh()
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  async handleUploadChange(event) {
    const { roles, examples } = await uploadYamlFile<{ roles: IXpertRole[]; examples: ICopilotKnowledge[] }>(
      event.target.files[0]
    )

    if (!examples?.length && !roles?.length) {
      this._toastrService.error('', 'PAC.Messages.NoRecordsFoundinFile', { Default: 'No records found in the file' })
      return
    }

    this.dialog
      .open(NgmConfirmOptionsComponent, {
        data: {
          information: this.translateService.instant('PAC.Copilot.Examples.ConfirmOptionsForUploadExample', {
            Default: 'Please confirm the options for upload copilot examples'
          }),
          formFields: [
            {
              className: FORMLY_W_1_2,
              key: 'createRole',
              type: 'checkbox',
              props: {
                label: this.translateService.instant('PAC.Copilot.Examples.CreateRole', {
                  Default: 'Auto create role if not existed'
                })
              }
            },
            {
              className: FORMLY_W_1_2,
              key: 'clearRole',
              type: 'checkbox',
              props: {
                label: this.translateService.instant('PAC.Copilot.Examples.ClearRole', {
                  Default: 'Clear all existed examples for roles'
                })
              }
            }
          ]
        }
      })
      .afterClosed()
      .pipe(
        switchMap((options) => {
          if (options) {
            this.loading.set(true)
            return this.exampleService.createBulk(examples, roles, options)
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this._toastrService.success('PAC.Messages.UploadSuccessfully', { Default: 'Upload successfully' })
          this.refresh()
          this.refreshFilter$.next()
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  async downloadTemplate() {
    saveAsYaml(`copilot-examples-template.yaml`, {
      roles: [
        {
          name: 'role1',
          title: 'Role 1',
          titleCN: '角色1',
          description: `Responsibility description of role 1`
        }
      ],
      examples: [
        {
          role: 'role1',
          command: 'command1',
          input: 'Input data string',
          output: 'Output data string'
        }
      ]
    })
  }
}
