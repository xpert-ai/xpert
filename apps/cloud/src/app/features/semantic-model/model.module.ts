import { NgModule } from '@angular/core'
import { provideLogger } from '../../@core'
import { SemanticModelRoutingModule } from './routing'

@NgModule({
  declarations: [],
  imports: [SemanticModelRoutingModule],
  providers: [provideLogger()]
})
export class SemanticModelModule {}
