import { NgModule } from '@angular/core'
import { NgmParameterSelectComponent } from './parameter-select/parameter-select.component';
import { NgmParameterComponent } from './parameter/parameter.component';
import { NgmParameterCreateComponent } from './parameter-create/parameter-create.component';

@NgModule({
  imports: [
    NgmParameterComponent,
    NgmParameterCreateComponent,
    NgmParameterSelectComponent
  ],
  exports: [
    NgmParameterComponent,
    NgmParameterCreateComponent,
    NgmParameterSelectComponent
  ],
  declarations: [],
  providers: []
})
export class NgmParameterModule {}
