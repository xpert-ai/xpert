import { Routes } from '@angular/router'
import { PACDataSourcesComponent } from './data-sources.component'

export default [
  {
    path: '',
    component: PACDataSourcesComponent,
    data: {
      title: 'Settings / Datasource',
    }
  }
] as Routes
