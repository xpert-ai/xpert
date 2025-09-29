import { NgModule } from '@angular/core'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmBreadcrumbBarComponent } from './breadcrumb/breadcrumb.component'
import { NgmHighlightDirective, ResizeObserverDirective } from './directives'
import { NgmDisplayBehaviourComponent } from './display-behaviour'
import { NgmInputModule } from './input/input.module'
import { ResizerModule } from './resizer/resizer.module'
import { NgmSearchComponent } from './search/search.component'
import { NgmMatSelectComponent, NgmSelectComponent } from './select'
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
import { NgmSlideToggleComponent } from './slide-toggle/slide-toggle.component'
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
    NgmMatSelectComponent,
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
    NgmSlideToggleComponent,
    NgmStepperComponent,
    NgmCopyComponent,
    NgmProgressSpinnerComponent
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
    NgmMatSelectComponent,
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
    NgmSlideToggleComponent,
    NgmStepperComponent,
    NgmCopyComponent,
    NgmProgressSpinnerComponent
  ],
  declarations: [],
  providers: []
})
export class NgmCommonModule {}
