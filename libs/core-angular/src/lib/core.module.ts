import { ModuleWithProviders, NgModule } from '@angular/core'
import { NgmShortNumberPipe } from '@xpert-ai/ocap-angular/core'
import { NgmTransformScaleDirective, ResizeObserverDirective } from './directives'
import { EntriesPipe, KeysPipe, PropertyPipe, SafePipe } from './pipes/index'
import { NxCoreService } from './services'

/**
 * @deprecated Migrate to `@xpert-ai/ocap-angular/core`
 */
@NgModule({
  declarations: [],
  imports: [NgmTransformScaleDirective, ResizeObserverDirective, NgmShortNumberPipe, EntriesPipe, SafePipe, KeysPipe, PropertyPipe],
  exports: [
    KeysPipe,
    EntriesPipe,
    PropertyPipe,
    SafePipe,
    ResizeObserverDirective,
    NgmTransformScaleDirective,
    NgmShortNumberPipe
  ]
})
export class NxCoreModule {
  static forRoot(): ModuleWithProviders<NxCoreModule> {
    return {
      ngModule: NxCoreModule,
      providers: [NxCoreService]
    }
  }
}
