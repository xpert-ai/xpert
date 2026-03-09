import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { DirtyCheckGuard, canActivateStoryEdit, storyPointResolver, storyResolver } from '../../@core/index'
import { StoryPointComponent } from './point/point.component'
import { StoryDesignerComponent } from './story/story.component'
import { StoryViewerComponent } from './viewer/viewer.component'
import { StoryWidgetComponent } from './widget/widget.component'
import { StoryCalculationComponent } from './calculations/calculation/calculation.component'
import { StoryCalculationsComponent } from './calculations/calculations.component'

const routes: Routes = [
  {
    path: 'point/:id',
    component: StoryPointComponent,
    resolve: { storyPoint: storyPointResolver }
  },
  {
    path: 'widget/:id',
    component: StoryWidgetComponent
  },
  {
    path: ':id',
    data: { title: 'pac.menu.story' },
    resolve: { story: storyResolver },
    children: [
      {
        path: '',
        component: StoryViewerComponent,
        data: { title: 'pac.menu.story' },
      },
      {
        path: 'edit',
        component: StoryDesignerComponent,
        canDeactivate: [DirtyCheckGuard],
        canActivate: [canActivateStoryEdit],
        data: { title: 'pac.menu.story' },
        children: [
          {
            path: 'calculations',
            component: StoryCalculationsComponent,
            data: { title: 'pac.story.calculations' },
            children: [
              {
                path: 'create',
                component: StoryCalculationComponent,
              },
              {
                path: ':cube/:key',
                component: StoryCalculationComponent,
              }
            ]
          },
        ]
      }
    ]
  },
]

@NgModule({
  declarations: [],
  imports: [
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class StoryRoutingModule {}
