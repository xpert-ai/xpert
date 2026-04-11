import { NgModule } from '@angular/core'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { NgmBreadcrumbBarComponent } from './breadcrumb/breadcrumb.component'
import { NgmHighlightDirective, NgmResizableDirective, ResizeObserverDirective } from './directives'
import { NgmDisplayBehaviourComponent } from './display-behaviour'
import { NgmInputModule } from './input/input.module'
import { ResizerModule } from './resizer/resizer.module'
import { NgmSearchComponent } from './search/search.component'
import { NgmAdvancedSelectComponent, NgmSelectComponent } from './select'
import { NgmSliderInputComponent } from './slider-input'
import { SplitterModule } from './splitter/splitter.module'
import { NgmSelectionTableComponent, NgmTableComponent, TableVirtualScrollModule } from './table'
import { NgmTagsComponent } from './tag'
import { NgmTreeSelectComponent } from './tree-select'
import { NgmDrawerTriggerComponent } from './drawer-trigger'
import { NgmScrollBackComponent } from './scroll'
import { NgmPropertyComponent } from './property/property.component'
import { NgmHierarchySelectComponent } from './hierarchy-select/hierarchy-select.component'
import { NgmDrawerContainerComponent } from './drawer'
import { NgmObjectNumberComponent } from './object-number/object-number.component'
import { NgmSpinComponent } from './spin/spin.component'
import { NgmCheckboxComponent } from './checkbox/checkbox.component'
import { NgmStepperComponent } from './stepper/stepper.component'
import { NgmCopyComponent } from './copy/copy.component'
import { NgmProgressSpinnerComponent } from './progress-spinner/spinner.component'

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
