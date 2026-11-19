import { CommonModule } from '@angular/common'
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { AppPlatformStorageUsage } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardProgressBarComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { AppPlatformService } from '../../../@core/services/app-platform.service'

@Component({
  selector: 'xp-account-storage-usage',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
    ...ZardCardImports
  ],
  templateUrl: './storage-usage.component.html'
})
export class AccountStorageUsageComponent implements OnInit {
  private readonly platform = inject(AppPlatformService)
  private readonly destroyRef = inject(DestroyRef)
  readonly usage = signal<AppPlatformStorageUsage | null>(null)
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly snapshot = computed(() => this.usage()?.snapshot)
  readonly exceeded = computed(() => {
    const usage = this.usage()
    return !!usage?.snapshot && usage.snapshot.usedBytes >= usage.limitBytes
  })
  readonly remaining = computed(() => Math.max(0, (this.usage()?.limitBytes ?? 0) - (this.snapshot()?.usedBytes ?? 0)))
  readonly percentage = computed(() => {
    const usage = this.usage()
    return usage?.snapshot ? (usage.snapshot.usedBytes / usage.limitBytes) * 100 : 0
  })
  readonly progress = computed(() => Math.min(100, this.percentage()))

  ngOnInit() {
    void this.load()
  }

  async load() {
    if (this.loading()) return
    this.loading.set(true)
    this.failed.set(false)
    try {
      const usage = await firstValueFrom(this.platform.getStorageUsage().pipe(takeUntilDestroyed(this.destroyRef)))
      if (!this.destroyRef.destroyed) this.usage.set(usage)
    } catch {
      if (!this.destroyRef.destroyed) this.failed.set(true)
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false)
    }
  }

  bytes(value: number) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    const index = value > 0 ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1) : 0
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value / 1024 ** index)} ${units[index]}`
  }
}
