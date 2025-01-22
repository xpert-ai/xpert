import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { NgxEchartsModule } from 'ngx-echarts'
import { provideLogger } from '../../@core'
import { STORY_WIDGET_COMPONENTS } from '../../widgets'
import { HomeRoutingModule } from './home-routing.module'

@NgModule({
  imports: [
    CommonModule,
    HomeRoutingModule,

    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    })
  ],
  exports: [],
  declarations: [],
  providers: [provideOcapCore(), provideLogger(), ...STORY_WIDGET_COMPONENTS]
})
export class HomeModule {}
