import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import {
import { ZardDialogService } from '@xpert-ai/headless-ui'
  IMG_ROOT,
  PACNotificationDestinationsService,
  routeAnimations,
  ROUTE_ANIMATIONS_ELEMENTS
} from '../../../../@core'
import { NewNotificationDestinationComponent } from '../new-notification-destination/new-notification-destination.component'

@Component({
  selector: 'pac-notification-destinations',
  templateUrl: './notification-destinations.component.html',
  styleUrls: ['./notification-destinations.component.scss'],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationDestinationsComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS
  IMG_ROOT = IMG_ROOT
  readonly destinations$ = this.store.getAll()
  constructor(private store: PACNotificationDestinationsService, private router: Router, private _dialog: ZardDialogService) {}

  ngOnInit(): void {}

  openCreate() {
    this._dialog
      .open(NewNotificationDestinationComponent)
      .afterClosed()
      .subscribe((result) => {})
  }

  create() {
    this.router.navigate(['settings/notification-destinations/new'])
  }

  edit(destination) {
    this.router.navigate(['settings/notification-destinations/', destination.id])
  }

  remove(data) {
    this.store.delete(data.id)
  }
}
