import { CdkListboxModule } from '@angular/cdk/listbox'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { Component, Inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { LinkedAnalysisSettings, LinkedInteractionApplyTo } from '@metad/story/core'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogModule, ZardFormImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    DragDropModule,
    ZardDialogModule,
    ZardButtonComponent,
    ...ZardFormImports,
    ButtonGroupDirective,
    TranslateModule
],
  selector: 'pac-story-linked-analysis',
  templateUrl: 'linked-analysis.component.html',
  styleUrls: ['linked-analysis.component.scss']
})
export class LinkedAnalysisComponent {
  LinkedInteractionApplyTo = LinkedInteractionApplyTo
  formGroup = new FormGroup({
    interactionApplyTo: new FormControl<LinkedInteractionApplyTo>(null),
    connectNewly: new FormControl<boolean>(false),
    linkedWidgets: new FormControl([])
  })

  get interactionApplyTo() {
    return this.formGroup.value.interactionApplyTo
  }

  applyTos = [
    LinkedInteractionApplyTo.OnlyThisWidget,
    LinkedInteractionApplyTo.AllWidgetsOnPage,
    LinkedInteractionApplyTo.OnlySelectedWidgets
  ]

  get widgets() {
    return this.data?.widgets
  }
  constructor(
    @Inject(Z_MODAL_DATA) public data: { linkedAnalysis: LinkedAnalysisSettings; widgets: ISelectOption[] }
  ) {
    this.formGroup.patchValue({
      ...data.linkedAnalysis,
      interactionApplyTo: data.linkedAnalysis.interactionApplyTo ?? LinkedInteractionApplyTo.AllWidgetsOnPage
    })
  }
}
