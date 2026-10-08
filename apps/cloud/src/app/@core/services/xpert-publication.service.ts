import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

/** Notify mounted Assistant clients only after the publish endpoint succeeds. */
@Injectable({ providedIn: 'root' })
export class XpertPublicationService {
  readonly changes$ = new Subject<{ assistantId: string; organizationId: string | null }>()
}
