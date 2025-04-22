import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, ViewContainerRef } from '@angular/core'
import { RouterModule } from '@angular/router'
import { injectProjectService, IXpertProject } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, startWith } from 'rxjs'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, CdkMenuModule, TranslateModule, EmojiAvatarComponent],
  selector: 'pac-chat-projects',
  templateUrl: './projects.component.html',
  styleUrl: 'projects.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatProjectsComponent {
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly projectSercice = injectProjectService()

  readonly #projects = derivedAsync<{projects?: IXpertProject[]; loading: boolean;}>(() => this.projectSercice.getAllMy().pipe(map(({items}) => ({projects: items, loading: false})), startWith({loading: true})))

  readonly projects = computed(() => this.#projects()?.projects)
  readonly loading = computed(() => this.#projects()?.loading)

  addProject() {}
}
