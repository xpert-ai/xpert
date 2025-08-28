import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import { NgModule } from '@angular/core'
import { HammerModule } from '@angular/platform-browser'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { IsNilPipe, NgMapPipeModule, NxCoreModule } from '@metad/core'
import { NxStoryResponsiveModule } from '@metad/story/responsive'
import { GridsterModule } from 'angular-gridster2'
import { NxStorySharedModule } from './shared.module'
import { StorySharesComponent } from './shares/shares.component'
import { NxStoryPointComponent } from './story-point/story-point.component'
import { NxStoryWidgetComponent } from './story-widget/story-widget.component'
import { NxStoryComponent } from './story/story.component'
import { SinglePageStoryComponent } from './single-page-story/sps.component'


@NgModule({
  declarations: [],
  imports: [
    NxStorySharedModule,
    OverlayModule,
    CdkMenuModule,
    GridsterModule,
    HammerModule,
    TranslateModule,
    IsNilPipe,
    NgMapPipeModule,
    ContentLoaderModule,
    NxStoryResponsiveModule,
    NxCoreModule,

    // OCAP Modules
    OcapCoreModule,
    NgmCommonModule,

    // Local modules
    StorySharesComponent,
    NxStoryComponent,
    NxStoryPointComponent,
    NxStoryWidgetComponent,
    SinglePageStoryComponent
  ],
  exports: [NxStoryComponent, NxStoryWidgetComponent, NxStoryPointComponent, SinglePageStoryComponent]
})
export class NxStoryModule {}
