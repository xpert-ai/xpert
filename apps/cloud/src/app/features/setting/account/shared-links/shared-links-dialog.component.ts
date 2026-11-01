import { Clipboard } from '@angular/cdk/clipboard'
import { DialogRef } from '@angular/cdk/dialog'
import { DatePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ConversationShareList, ManagedConversationShare } from '@xpert-ai/contracts'
import {
  XpDialogActionGroupDirective,
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { ConversationSharingService } from '../../../../@core/services/conversation-sharing.service'

@Component({
  standalone: true,
  selector: 'xp-shared-links-dialog',
  imports: [
    TranslateModule,
    FormsModule,
    DatePipe,
    ZardButtonComponent,
    ZardInputDirective,
    XpDialogActionGroupDirective,
    ...XpDialogFrameImports
  ],
  templateUrl: './shared-links-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharedLinksDialogComponent implements OnInit, OnDestroy {
  private readonly clipboard = inject(Clipboard)
  private readonly shares = inject(ConversationSharingService)
  private readonly dialog = inject(DialogRef)
  private request = 0
  private destroyed = false
  readonly pageSize = 20
  readonly page = signal<ConversationShareList | null>(null)
  readonly offset = signal(0)
  readonly loading = signal(false)
  readonly busy = signal(false)
  readonly error = signal('')
  readonly notice = signal('')
  readonly pending = signal<ManagedConversationShare | 'all' | null>(null)
  search = ''
  private appliedSearch = ''

  ngOnInit() {
    void this.load(0, true)
  }
  ngOnDestroy() {
    this.destroyed = true
    this.request++
  }

  async load(offset = 0, fresh = false) {
    const request = ++this.request
    const before = fresh ? undefined : this.page()?.asOf
    this.loading.set(true)
    this.error.set('')
    try {
      const page = await firstValueFrom(
        this.shares.listMine({
          limit: this.pageSize,
          offset,
          search: this.appliedSearch,
          ...(before ? { before } : {})
        })
      )
      if (request !== this.request || this.destroyed) return
      this.page.set(page)
      this.offset.set(offset)
    } catch {
      if (request === this.request && !this.destroyed) this.error.set('ConversationShare.ManagementLoadFailed')
    } finally {
      if (request === this.request && !this.destroyed) this.loading.set(false)
    }
  }

  find() {
    this.appliedSearch = this.search.trim()
    void this.load(0, true)
  }

  copy(row: ManagedConversationShare) {
    if (!row.url || row.status !== 'active' || this.busy() || this.loading()) return
    this.error.set('')
    this.notice.set('')
    if (this.clipboard.copy(row.url)) this.notice.set('ConversationShare.Copied')
    else this.error.set('ConversationShare.CopyFailed')
  }

  confirmRevoke(row: ManagedConversationShare | 'all') {
    if (this.busy() || this.loading()) return
    this.notice.set('')
    this.error.set('')
    this.pending.set(row)
  }

  async revoke() {
    const pending = this.pending()
    const before = this.page()?.asOf
    if (!pending || !before || this.busy()) return
    this.busy.set(true)
    this.dialog.disableClose = true
    this.error.set('')
    try {
      if (pending === 'all') {
        await firstValueFrom(this.shares.revokeAllMine({ confirmation: 'revoke-all', before }))
      } else {
        await firstValueFrom(this.shares.revokeMine(pending.id))
      }
      if (this.destroyed) return
      this.pending.set(null)
      this.notice.set('ConversationShare.ManagementRevoked')
      await this.load(0, true)
    } catch {
      if (!this.destroyed) this.error.set('ConversationShare.ManagementRevokeFailed')
    } finally {
      this.busy.set(false)
      this.dialog.disableClose = false
    }
  }

  pendingTitle() {
    const pending = this.pending()
    return pending && pending !== 'all' ? pending.title : ''
  }

  close() {
    if (!this.busy()) this.dialog.close()
  }
}
