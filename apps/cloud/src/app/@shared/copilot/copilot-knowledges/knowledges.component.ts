import { Dialog } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, DatePipe } from '@angular/common'
import { Component, computed, effect, inject, input, LOCALE_ID, model, signal, TemplateRef, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { saveAsYaml, uploadYamlFile } from '@metad/core'
import { FORMLY_W_1_2 } from '@metad/formly'
import { CdkConfirmDeleteComponent, CdkConfirmOptionsComponent, NgmCommonModule, TableColumn } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedFrom } from 'ngxtension/derived-from'
import { BehaviorSubject, combineLatest, EMPTY, map, pipe, switchMap } from 'rxjs'
import { CopilotExampleService, getErrorMessage, ICopilotKnowledge, injectToastr, IXpert } from '../../../@core'
import { userLabel } from '../../pipes'
import { ActivatedRoute, Router } from '@angular/router'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    NgmCommonModule
  ],
  selector: 'copilot-knowledges',
  templateUrl: 'knowledges.component.html',
  styleUrls: ['knowledges.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CopilotKnowledgesComponent {
  eDisplayBehaviour = DisplayBehaviour

  // Injectors
  readonly exampleService = inject(CopilotExampleService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly locale = inject(LOCALE_ID)
  readonly datePipe = new DatePipe(this.locale,)

  // Inputs
  readonly xpert = input<Partial<IXpert>>()

  // Children
  readonly actionTemplate = viewChild('actionTemplate', { read: TemplateRef })
  readonly vector = viewChild('vector', { read: TemplateRef })

  // States
  readonly xpertName = computed(() => this.xpert()?.name)
  
  readonly commandFilter = model<string>(null)

  readonly refreshFilter$ = new BehaviorSubject<void>(null)

  readonly commands = derivedFrom(
    [this.xpertName],
    pipe(
      switchMap(([xpertName]) =>
        this.refreshFilter$.pipe(switchMap(() => this.exampleService.getCommands({ role: xpertName })))
      ),
      map((commands) =>
        commands.map((command) => ({
          key: command,
          caption: command
        }))
      )
    ),
    { initialValue: [] }
  )

  readonly refresh$ = new BehaviorSubject<void>(null)
  
  readonly items = toSignal(combineLatest([
    toObservable(this.xpertName),
    toObservable(this.commandFilter),
    this.refresh$
  ]).pipe(
    switchMap(([xpertName, command,]) => {
      return this.exampleService.getAll({
        filter: {
          role: xpertName,
          command
        },
        relations: ['updatedBy']
      })
    })
  ), { initialValue: null })

  readonly loading = signal(true)

  readonly columns = toSignal<TableColumn[]>(
    this.#translate.stream('PAC.Copilot.Examples').pipe(
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
          caption: i18n?.UpdatedAt || 'Updated At',
          pipe: (d) => this.datePipe.transform(d, 'short')
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

  


  constructor() {
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

  retrieve() {
    this.refresh()
  }

  addExample() {
    this.router.navigate(['create'], { relativeTo: this.route })
  }

  editExample(id: string) {
    this.router.navigate([id], { relativeTo: this.route })
  }

  async handleUploadChange(event) {
    const { roles, examples } = await uploadYamlFile<{ roles: IXpert[]; examples: ICopilotKnowledge[] }>(
      event.target.files[0]
    )

    if (!examples?.length && !roles?.length) {
      this.#toastr.error('', 'PAC.Messages.NoRecordsFoundinFile', { Default: 'No records found in the file' })
      return
    }

    this.#dialog
      .open<{clearRole: boolean}>(CdkConfirmOptionsComponent, {
        data: {
          information: this.#translate.instant('PAC.Copilot.Examples.ConfirmOptionsForUploadExample', {
            Default: 'Please confirm the options for upload copilot examples'
          }),
          formFields: [
            // {
            //   className: FORMLY_W_1_2,
            //   key: 'createRole',
            //   type: 'checkbox',
            //   props: {
            //     label: this.#translate.instant('PAC.Copilot.Examples.CreateRole', {
            //       Default: 'Auto create role if not existed'
            //     })
            //   }
            // },
            {
              className: FORMLY_W_1_2,
              key: 'clearRole',
              type: 'checkbox',
              props: {
                label: this.#translate.instant('PAC.Copilot.Examples.ClearRole', {
                  Default: 'Clear all existed examples for roles'
                })
              }
            }
          ]
        }
      })
      .closed
      .pipe(
        switchMap((options) => {
          if (options) {
            this.loading.set(true)
            return this.exampleService.createBulk(examples.map((item) => ({...item, role: this.xpertName(), xpertId: this.xpert().id})), options)
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.UploadSuccessfully', { Default: 'Upload successfully' })
          this.refresh()
          this.refreshFilter$.next()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
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

  deleteExample(id: string, input: string) {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: id,
          information: `${this.#translate.instant('PAC.Copilot.Examples.Input', {Default: 'Input'})}: ${input}`
        }
      })
      .closed
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
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
          return this.refresh()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }
}
