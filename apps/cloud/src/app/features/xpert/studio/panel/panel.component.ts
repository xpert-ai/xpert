import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, HostListener, inject, model, signal } from '@angular/core'
import { listFadeIn } from 'apps/cloud/src/app/@core'
import { SelectionService } from '../domain'
import { XpertStudioComponent } from '../studio.component'
import { XpertStudioPanelExecutionComponent } from './execution/execution.component'
import { XpertStudioPanelKnowledgeComponent } from './knowledge/knowledge.component'
import { XpertStudioPreviewComponent } from './preview/preview.component'
import { XpertStudioPanelToolsetComponent } from './toolset/toolset.component'
import { XpertStudioPanelVariablesComponent } from './variables/variables.component'
import { XpertStudioPanelWorkflowComponent } from './workflow/workflow.component'
import { XpertStudioPanelAgentComponent } from './xpert-agent/agent.component'
import { XpertStudioPanelXpertComponent } from './xpert/xpert.component'
import { XpertStudioPanelEnvironmentComponent } from './environment/environment.component'

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
    XpertStudioPanelWorkflowComponent,
    XpertStudioPanelEnvironmentComponent
  ],
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss',
  animations: [listFadeIn(100)]
})
export class XpertStudioPanelComponent {
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly selectionService = inject(SelectionService)

  // Inputs
  readonly sidePanel = model<'preview' | 'variables' | 'environments'>(null)
  readonly executionId = model<string>()

  // States
  readonly selectedNodes = computed(() => {
    const node = this.selectionService.selectedNode()
    return node ? [node] : []
  })

  // Track if preview component has been created, keep it mounted once created
  readonly previewCreated = signal(false)
  readonly showPreview = computed(() => 
    this.sidePanel() === 'preview' || (this.previewCreated() && this.sidePanel() !== null)
  )

  readonly minPanelWidth = 420
  readonly maxPanelWidth = 720
  readonly panelWidth = signal(this.minPanelWidth)
  private isResizing = false
  private startX = 0
  private startWidth = 0

  constructor() {
    // Mark preview component as created when switching to preview panel
    effect(() => {
      if (this.sidePanel() === 'preview') {
        this.previewCreated.set(true)
      }
    }, { allowSignalWrites: true })
  }

  close() {
    this.selectionService.selectNode(null)
  }

  closeExecution() {
    this.executionId.set(null)
  }

  onResized() {}

  onResizeMouseDown(event: MouseEvent): void {
    this.isResizing = true
    this.startX = event.clientX
    this.startWidth = this.panelWidth()

    event.preventDefault()
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isResizing) {
      const offset = this.startX - event.clientX
      this.panelWidth.set(this.startWidth + offset)
      if (this.panelWidth() < this.minPanelWidth) { // Set minimum width
        this.panelWidth.set(this.minPanelWidth)
      }
      if (this.panelWidth() > this.maxPanelWidth) {
        this.panelWidth.set(this.maxPanelWidth)
      }

      this.onResized()
      event.preventDefault()
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false
  }
}
