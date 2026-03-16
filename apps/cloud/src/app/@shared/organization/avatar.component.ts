
import { Component, Input } from '@angular/core'
import { IOrganization } from '../../@core'

@Component({
    standalone: true,
    selector: 'pac-org-avatar',
    template: `<img class="w-full h-full" [src]="organization?.imageUrl || '/assets/images/illustrations/default-company-logo.svg'" alt="{{organization?.name}}"/>`,
    styles: [``],
    imports: []
})
export class OrgAvatarComponent {
  @Input() organization?: Partial<IOrganization>
}
