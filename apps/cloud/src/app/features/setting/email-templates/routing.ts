import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { PermissionsEnum } from '../../../@core'
import { EmailTemplatesComponent } from './email-templates.component'
import { EmailTemplateComponent } from './template/template.component'

export default [
  {
		path: '',
		component: EmailTemplatesComponent,
		canActivate: [NgxPermissionsGuard],
		data: {
			permissions: {
				only: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES],
				redirectTo: '/settings'
			},
			selectors: {
				project: false,
				employee: false,
				date: false,
				organization: true
			}
		},
    children: [
      {
        path: ':id',
        component: EmailTemplateComponent
      }
    ]
	}
] as Routes
