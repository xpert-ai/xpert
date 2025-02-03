import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model } from '@angular/core'
import { listFadeIn } from 'apps/cloud/src/app/@core'
import { SelectionService } from '../domain'
import { XpertStudioComponent } from '../studio.component'
import { XpertStudioPanelToolsetComponent } from './toolset/toolset.component'
import { XpertStudioPanelAgentComponent } from './xpert-agent/agent.component'
import { XpertStudioPanelXpertComponent } from './xpert/xpert.component'
import { XpertStudioPanelKnowledgeComponent } from './knowledge/knowledge.component'
import { XpertStudioPanelExecutionComponent } from './execution/execution.component'
import { XpertStudioPanelVariablesComponent } from './variables/variables.component'
import { XpertStudioPreviewComponent } from './preview/preview.component'
import { XpertStudioPanelWorkflowComponent } from './workflow/workflow.component'

@Component({
  selector: 'xpert-studio-panel',
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    XpertStudioPanelAgentComponent,
    XpertStudioPanelXpertComponent,
    XpertStudioPanelToolsetComponent,
    XpertStudioPanelKnowledgeComponent,
    XpertStudioPreviewComponent,
    XpertStudioPanelExecutionComponent,
    XpertStudioPanelVariablesComponent,
    XpertStudioPanelWorkflowComponent
  ],
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss',
  animations: [
    listFadeIn(100)
  ]
})
export class XpertStudioPanelComponent {
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly selectionService = inject(SelectionService)

  // Inputs
  readonly sidePanel = model<'preview' | 'variables'>(null)
  readonly executionId = model<string>()

  readonly selectedNodes = computed(() => {
    const node = this.selectionService.selectedNode()
    return node ? [node] : []
  })

  close() {
    this.selectionService.selectNode(null)
  }

  closeExecution() {
    this.executionId.set(null)
  }
}
