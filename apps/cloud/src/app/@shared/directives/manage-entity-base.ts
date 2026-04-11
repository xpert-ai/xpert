import { effect, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { IBasePerTenantEntityModel } from '../../@core'
import { TranslationBaseComponent } from '../language/translation-base.component'

/**
 * Extends this class to use manage entity methods
 */
export abstract class ManageEntityBaseComponent<
  T extends IBasePerTenantEntityModel = IBasePerTenantEntityModel
> extends TranslationBaseComponent {
  protected readonly router = inject(Router)
  protected readonly route = inject(ActivatedRoute)

  openedLinks = signal<T[]>([])
  currentLink = signal<T | null>(null)

  constructor() {
    super()

    effect(
      () => {
        if (this.currentLink()) {
          const links = this.openedLinks()
          const index = links.findIndex((item) => item.id === this.currentLink().id)
          if (index > -1) {
            if (links[index] !== this.currentLink()) {
              this.openedLinks.set([...links.slice(0, index), this.currentLink(), ...links.slice(index + 1)])
            }
          } else {
            this.openedLinks.set([...links, this.currentLink()])
          }
        }
      }
    )
  }

  trackByEntityId(index: number, item: T) {
    return item?.id
  }

  setCurrentLink(link: T) {
    this.currentLink.set(link)
  }

  removeOpenedLink(link: T) {
    this.currentLink.set(null)
    this.openedLinks.set(this.openedLinks().filter((item) => item.id !== link.id))
    this.router.navigate(['.'], { relativeTo: this.route })
  }
}
