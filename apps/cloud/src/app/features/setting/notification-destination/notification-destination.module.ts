import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { EditDestinationComponent } from './edit-destination/edit-destination.component'
import { NewNotificationDestinationComponent } from './new-notification-destination/new-notification-destination.component'
import { NotificationDestinationRoutingModule } from './notification-destination-routing.module'
import { NotificationDestinationsComponent } from './notification-destinations/notification-destinations.component'
import { MaterialModule } from '../../../@shared/material.module'
import { SharedModule } from '../../../@shared/shared.module'

@NgModule({
  imports: [
    SharedModule,
    MaterialModule,
    FormlyModule,
    NotificationDestinationRoutingModule
  ],
  exports: [],
  declarations: [NotificationDestinationsComponent, NewNotificationDestinationComponent, EditDestinationComponent],
  providers: []
})
export class NotificationDestinationModule {}
