import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { KnowledgeRecallParamsComponent, KnowledgeSelectReferenceComponent, XpertKnowledgeCaseFormComponent } from '@cloud/app/@shared/knowledge'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectToastr,
  IWFNKnowledgeRetrieval,
  IWorkflowNode,
  KBMetadataFieldDef,
  STANDARD_METADATA_FIELDS,
  WorkflowLogicalOperator,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { attrModel, linkedModel, TSelectOption } from '@metad/ocap-angular/core'
import { NgmSelectPanelComponent } from '@cloud/app/@shared/common'
import { CapitalizePipe } from '@metad/core'

@Component({
  selector: 'xpert-workflow-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    CdkMenuModule,
    CapitalizePipe,
    NgmSelectPanelComponent,
    StateVariableSelectComponent,
    KnowledgeRecallParamsComponent,
    XpertKnowledgeCaseFormComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowKnowledgeComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertAPIService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly knowledgeRetrieval = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNKnowledgeRetrieval,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly queryVariable = attrModel(this.knowledgeRetrieval, 'queryVariable')
  readonly knowledgebases = attrModel(this.knowledgeRetrieval, 'knowledgebases')
  readonly recall = attrModel(this.knowledgeRetrieval, 'recall')
  readonly retrieval = attrModel(this.knowledgeRetrieval, 'retrieval')
  readonly retrievalMetadata = attrModel(this.retrieval, 'metadata')
  readonly filtering_mode = attrModel(this.retrievalMetadata, 'filtering_mode', 'disabled')
  readonly filtering_conditions = attrModel(this.retrievalMetadata, 'filtering_conditions', {
    caseId: '0',
    conditions: [],
    logicalOperator: WorkflowLogicalOperator.AND
  })

  readonly knowledgebaseList = toSignal(this.studioService.knowledgebases$)
  readonly selectedKnowledgebases = computed(() => {
    return this.knowledgebases()?.map((id) => ({
      id,
      kb: this.knowledgebaseList()?.find((_) => _.id === id)
    })) ?? []
  })

  readonly metadataFields = computed(() => {
    const schemas: KBMetadataFieldDef[][] = this.selectedKnowledgebases().map(({kb}) => kb).map((knowledgebase) => knowledgebase?.metadataSchema || [])
    // 找出 schemas 之间的交集
    const schema: KBMetadataFieldDef[] = []
    if (schemas.length > 0) {
      const firstSchema = schemas[0]
      firstSchema.forEach((field) => {
        if (schemas.every((s) => s.some((f) => f.key === field.key))) {
          schema.push(field)
        }
      })
    }
    STANDARD_METADATA_FIELDS.forEach(({fields}) => {
      fields.forEach((field) => {
        if (!schema?.some((_) => _.key === field.key)) {
            schema.push(field)
        }
      })
    })
    return schema
  })

  readonly showOutput = signal<boolean>(true)

  readonly filterModeOptions: TSelectOption[] = [
      {
        value: 'disabled',
        label: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_disabled', {Default: 'Disabled'}),
        description: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_disabled_Description', {Default: 'No metadata filtering applied.'})
      },
      {
        value: 'manual',
        label: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_manual', {Default: 'Manual'}),
        description: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_manual_Description', {Default: 'Manually configure metadata filtering options by user.'})
      }
    ]

  onFocus(event: Event) {}

  select() {
    this.#dialog
      .open<string[]>(KnowledgeSelectReferenceComponent, {
        data: {
          knowledgebases: this.knowledgebaseList(),
          selected: this.knowledgebases()
        }
      })
      .closed.subscribe((value) => {
        if (value) {
          this.knowledgebases.set(value)
        }
      })
  }

  remove(index: number) {
    this.knowledgebases.update((ids) => {
      ids.splice(index, 1)
      return [...ids]
    })
  }

  edit(id: string) {}

  toggleShowOutput() {
    this.showOutput.update((state) => !state)
  }
}
