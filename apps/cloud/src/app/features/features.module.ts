import { CommonModule } from '@angular/common'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { NgModule } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpFormlyModule, provideFormly, provideFormlyUi } from '@xpert-ai/formly'
import { LayoutComponent, SidebarComponent } from '@xpert-ai/headless-ui'
import { ZardButtonComponent, ZardHighlightComponent } from '@xpert-ai/headless-ui'
import { environment } from '../../environments/environment'
import { DirtyCheckGuard, LocalAgent, ServerAgent, ServerSocketAgent, provideLogger } from '../@core/index'
import { XpThemeModule } from '../@theme/theme.module'
import { provideCheckpointSaver } from '../@core/copilot'
import { FeaturesRoutingModule } from './features-routing.module'
import { FeaturesComponent } from './features.component'
import { CloudSidebarComponent } from './sidebar'

@NgModule({
  declarations: [FeaturesComponent],
  imports: [
    CommonModule,
    DragDropModule,
    TranslateModule,
    FeaturesRoutingModule,
    LayoutComponent,
    SidebarComponent,
    CloudSidebarComponent,
    XpThemeModule,
    XpFormlyModule,
    ZardButtonComponent,
    ZardHighlightComponent
  ],
  providers: [
    DirtyCheckGuard,
    provideLogger(),
    provideFormly(),
    provideFormlyUi(),
    ...(environment.enableLocalAgent ? [LocalAgent] : []),
    ServerAgent,
    ServerSocketAgent,
    provideCheckpointSaver()
  ]
})
export class FeaturesModule {}
