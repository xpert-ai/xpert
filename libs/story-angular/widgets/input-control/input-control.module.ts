import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ZardChipsImports, ZardDividerComponent, ZardFormImports, ZardIconComponent, ZardInputDirective, ZardMenuImports } from '@xpert-ai/headless-ui'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { NgmControlsModule, NgmMemberDatepickerModule } from '@xpert-ai/ocap-angular/controls'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@xpert-ai/ocap-angular/entity'
import { NgmParameterComponent } from '@xpert-ai/ocap-angular/parameter'
import { SlicerLabelComponent } from '@xpert-ai/ocap-angular/selection'
import { TranslateModule } from '@ngx-translate/core'
import { NxInputControlComponent } from './input-control.component'
import { InputControlPlaceholderComponent } from './placeholder/placeholder.component'

@NgModule({
  declarations: [NxInputControlComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...ZardChipsImports, ...ZardMenuImports, ZardIconComponent, ZardDividerComponent, ...ZardFormImports, ZardInputDirective, TranslateModule, DensityDirective, NgmMemberDatepickerModule, NgmCommonModule, NgmParameterComponent, NgmEntityPropertyComponent, NgmControlsModule, InputControlPlaceholderComponent, SlicerLabelComponent],
  exports: [NxInputControlComponent]
})
export class InputControlModule {}
