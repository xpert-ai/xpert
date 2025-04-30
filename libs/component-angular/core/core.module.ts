import { NgModule } from '@angular/core'
import { SemanticColorDirective } from './directives/semantic-color.directive'

/**
 * @deprecated
 */
@NgModule({
  imports: [],
  exports: [SemanticColorDirective],
  declarations: [SemanticColorDirective]
})
export class ComponentCoreModule {}
