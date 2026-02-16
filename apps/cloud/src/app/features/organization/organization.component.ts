import { Component } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators'

@Component({
  standalone: false,
  selector: 'pac-organization',
  templateUrl: './organization.component.html',
  styleUrls: ['./organization.component.scss']
})
export class OrganizationComponent {
  public id$ = this.route.paramMap.pipe(
    startWith(this.route.snapshot.paramMap),
    map((paramMap) => paramMap.get('id')),
    filter(Boolean),
    map(decodeURIComponent),
    distinctUntilChanged(),
    takeUntilDestroyed()
  )
  constructor(private route: ActivatedRoute) {}
}
