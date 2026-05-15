import { NgModule } from '@angular/core'
import {
  NgmAdvancedSelectComponent,
  NgmBreadcrumbBarComponent,
  NgmCheckboxComponent,
  NgmCopyComponent,
  NgmDisplayBehaviourComponent,
  NgmDrawerContainerComponent,
  NgmDrawerTriggerComponent,
  NgmHighlightDirective,
  NgmObjectNumberComponent,
  NgmProgressSpinnerComponent,
  NgmResizableDirective,
  NgmScrollBackComponent,
  NgmSearchComponent,
  NgmSelectComponent,
  NgmSelectionTableComponent,
  NgmSliderInputComponent,
  NgmSpinComponent,
  NgmStepperComponent,
  NgmTableComponent,
  NgmTagsComponent,
  NgmTreeSelectComponent,
  ResizeObserverDirective
} from '@xpert-ai/headless-ui'
import {
  AppearanceDirective,
  ButtonGroupDirective,
  DensityDirective,
  OcapCoreModule
} from '@xpert-ai/ocap-angular/core'
import { NgmInputModule } from './input/input.module'
import { ResizerModule } from './resizer/resizer.module'
import { SplitterModule } from './splitter/splitter.module'
import { TableVirtualScrollModule } from './table'
import { NgmPropertyComponent } from './property/property.component'
import { NgmHierarchySelectComponent } from './hierarchy-select/hierarchy-select.component'

@NgModule({
  imports: [
    ResizerModule,
    SplitterModule,

    OcapCoreModule,
    NgmHighlightDirective,
    ResizeObserverDirective,
    NgmBreadcrumbBarComponent,
    NgmSearchComponent,
    TableVirtualScrollModule,
    NgmTreeSelectComponent,
    NgmAdvancedSelectComponent,
    NgmSelectComponent,
    NgmDisplayBehaviourComponent,
    NgmSliderInputComponent,
    NgmInputModule,
    NgmTagsComponent,
    DensityDirective,
    ButtonGroupDirective,
    AppearanceDirective,
    NgmDrawerTriggerComponent,
    NgmScrollBackComponent,
    NgmTableComponent,
    NgmSelectionTableComponent,
    NgmPropertyComponent,
    NgmHierarchySelectComponent,
    NgmDrawerContainerComponent,
    NgmObjectNumberComponent,
    NgmSpinComponent,
    NgmCheckboxComponent,
    NgmStepperComponent,
    NgmCopyComponent,
    NgmProgressSpinnerComponent,
    NgmResizableDirective
  ],
  exports: [
    ResizerModule,
    SplitterModule,
    NgmHighlightDirective,
    NgmBreadcrumbBarComponent,
    ResizeObserverDirective,
    NgmDisplayBehaviourComponent,
    NgmSearchComponent,
    TableVirtualScrollModule,
    NgmTreeSelectComponent,
    NgmAdvancedSelectComponent,
    NgmSelectComponent,
    NgmSliderInputComponent,
    NgmInputModule,
    NgmTagsComponent,
    DensityDirective,
    ButtonGroupDirective,
    AppearanceDirective,
    NgmDrawerTriggerComponent,
    NgmScrollBackComponent,
    NgmTableComponent,
    NgmSelectionTableComponent,
    NgmPropertyComponent,
    NgmHierarchySelectComponent,
    NgmDrawerContainerComponent,
    NgmObjectNumberComponent,
    NgmSpinComponent,
    NgmCheckboxComponent,
    NgmStepperComponent,
    NgmCopyComponent,
    NgmProgressSpinnerComponent,
    NgmResizableDirective
  ],
  declarations: [],
  providers: []
})
export class NgmCommonModule {}
