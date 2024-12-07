import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { CatalogComponent } from './catalog/catalog.component'
import { DashboardComponent } from './dashboard/dashboard.component'
import { HomeComponent } from './home.component'
import { TrendingComponent } from './trending/trending.component'

export function redirectTo() {
  return ''
}

const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    children: [
      {
        path: '',
        component: DashboardComponent,
      },
      {
        path: 'catalog',
        component: CatalogComponent
      },
      {
        path: 'trending',
        component: TrendingComponent
      },
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HomeRoutingModule {}
