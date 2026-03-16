import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ZardChipsImports, ZardDividerComponent, ZardFormImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatMenuModule } from '@angular/material/menu'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmControlsModule, NgmMemberDatepickerModule } from '@metad/ocap-angular/controls'
import { DensityDirective } from '@metad/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import { NgmParameterComponent } from '@metad/ocap-angular/parameter'
import { SlicerLabelComponent } from '@metad/ocap-angular/selection'
import { TranslateModule } from '@ngx-translate/core'
import { NxInputControlComponent } from './input-control.component'
import { InputControlPlaceholderComponent } from './placeholder/placeholder.component'

@NgModule({
  declarations: [NxInputControlComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...ZardChipsImports, MatMenuModule, ZardIconComponent, ZardDividerComponent, MatListModule, ...ZardFormImports, ZardInputDirective, TranslateModule, DensityDirective, NgmMemberDatepickerModule, NgmCommonModule, NgmParameterComponent, NgmEntityPropertyComponent, NgmControlsModule, InputControlPlaceholderComponent, SlicerLabelComponent],
  exports: [NxInputControlComponent]
})
export class InputControlModule {}
