import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TagDirectoryComponent } from '../../../../@shared/tag/directory/tag-directory.component'

@Component({
  standalone: true,
  imports: [TagDirectoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tenant-tag-maintain',
  templateUrl: './maintain.component.html',
  styleUrls: ['./maintain.component.scss']
})
export class TenantTagMaintainComponent {}
