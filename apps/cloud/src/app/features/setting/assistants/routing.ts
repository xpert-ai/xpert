import { Routes } from '@angular/router'
import { AssistantsSettingsComponent } from './assistants.component'

export default [
  {
    path: '',
    component: AssistantsSettingsComponent,
    data: {
      title: 'Settings / Assistants',
      scopeContext: 'dual-scope'
    }
  }
] as Routes
