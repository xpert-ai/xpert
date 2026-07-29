import { Routes } from '@angular/router'
import { XpDataSourcesComponent } from './data-sources.component'

export default [
  {
    path: '',
    component: XpDataSourcesComponent,
    data: {
      title: 'Settings / Datasource'
    }
  }
] as Routes
