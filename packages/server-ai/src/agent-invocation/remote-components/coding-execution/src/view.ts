import type { ExecutionI18n } from './i18n/core'
import { buttonVariants } from '@xpert-ai/shadcn-ui'
import { codingToolBrand } from '../../../../shared/coding-tools/branding'
import { ActivityRow } from './activity-row'
import { ExecutionHeader, type Palette } from './header'
import { button, copyText, el, hasSelection, icon, text } from './dom'
import { activityText, isDuplicateSummary, type Activity, type Execution, type Output, type Snapshot } from './model'
import { TranscriptSearch } from './search'
import { ReplyContent } from './reply-content'

export class ExecutionView {
    readonly element = el('main', '', 'execution-view')
    readonly scroll = el('div', '', 'transcript-scroll')
    readonly transcript = el('section', '', 'transcript')
    private header: ExecutionHeader
    private surface = el('div', '', 'execution-surface text-sm')
    private palette: Palette = 'host'
    private banner = el('p', '', 'connection-notice')
    private empty = el('p', '', 'empty-state')
    private gaps = el('p', '', 'capture-notice')
    private result = el('div', '', 'final-summary')
    private resultReply: ReplyContent
    private error = el('p', '', 'execution-error searchable')
    private files = el('div', '', 'artifacts')
    private footer = el('footer', '', 'viewer-footer')
    private followText = el('span')
    private latest = button('', () => this.setFollow(true))
    private info = el('details', '', 'technical-info')
    private infoTitle = el('summary')
    private infoBody = el('div', '', 'technical-body')
    private shortcuts = el('span', '', 'keyboard-hints')
    private toast = el('span', '', 'copy-status')
    private rows = new Map<string, ActivityRow>()
    private artifacts = new Map<string, HTMLButtonElement>()
    private infoFields = new Map<string, HTMLElement>()
    readonly items = new Map<string, Activity>()
    readonly outputs = new Map<string, Output>()
    private current?: Snapshot
    private follow = true
    private hasNew = false
    private locale = ''
    private search: TranscriptSearch
    private toastTimer?: number
    private toastKey?: 'feedback.copied' | 'feedback.copyUnavailable' | 'feedback.downloadFailed'
    private connectionError = false
    constructor(
        private i18n: ExecutionI18n,
        private onOutput: (item: Activity, previous?: Output) => Promise<Output>,
        private onDownload: (file: NonNullable<NonNullable<Execution['result']>['artifacts']>[number]) => Promise<void>
    ) {
        this.resultReply = new ReplyContent(i18n, (value) => void this.copy(value))
        this.result.append(this.resultReply.element)
        this.header = new ExecutionHeader({
            search: () => {
                this.setFollow(false)
                this.search.show()
            },
            follow: () => this.setFollow(!this.follow),
            copy: () => {
                void this.copy(this.copyAll())
            },
            theme: (value) => {
                this.palette = value
                this.element.dataset.palette = value
                this.updateHeader()
            }
        })
        this.search = new TranscriptSearch(this.transcript, i18n, (query) => {
            if (!query) return
            for (const item of this.items.values())
                if (activityText(item, this.i18n, this.outputFor(item)).toLocaleLowerCase().includes(query))
                    this.rows.get(item.id)?.reveal()
        })
        this.transcript.append(this.empty, this.gaps)
        this.scroll.append(this.transcript)
        this.transcript.append(this.error, this.result, this.files)
        this.info.append(this.infoTitle, this.infoBody)
        this.footer.append(this.followText, this.toast, this.info, this.shortcuts)
        this.latest.className = buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'absolute bottom-16 right-8'
        })
        this.surface.append(this.search.element, this.banner, this.scroll, this.latest, this.footer)
        this.element.append(this.header.element, this.surface)
        this.banner.hidden = this.latest.hidden = this.gaps.hidden = this.error.hidden = this.result.hidden = true
        this.toast.setAttribute('role', 'status')
        this.scroll.tabIndex = 0
        this.scroll.addEventListener(
            'wheel',
            (event) => {
                if (event.deltaY < 0) this.setFollow(false)
            },
            { passive: true }
        )
        this.scroll.addEventListener('touchmove', () => this.setFollow(false), { passive: true })
        this.scroll.addEventListener('pointerdown', (event) => {
            if (event.target === this.scroll) this.setFollow(false)
        })
        this.element.addEventListener('keydown', (event) => this.onKey(event))
        this.element.dataset.palette = 'host'
        this.translate()
        this.setFollow(true)
    }
    translate() {
        const locale = this.i18n.locale
        if (locale === this.locale) return
        this.locale = locale
        this.element.lang = locale
        this.transcript.setAttribute('aria-label', this.i18n.t('view.activity'))
        this.scroll.setAttribute('aria-label', this.i18n.t('view.transcript'))
        text(this.infoTitle, this.i18n.t('metadata.title'))
        text(this.shortcuts, this.i18n.t('view.shortcuts'))
        this.latest.replaceChildren(document.createTextNode(this.i18n.t('view.jumpLatest')), icon('down'))
        this.latest.title = this.i18n.t('view.jumpLatest')
        this.latest.setAttribute('aria-label', this.latest.title)
        this.showError(this.connectionError)
        if (this.toastKey) text(this.toast, this.i18n.t(this.toastKey))
        if (!this.current) text(this.empty, this.i18n.t('empty.loading'))
        this.search.translate()
        this.updateFollow()
    }
    showError(failed: boolean) {
        this.connectionError = failed
        this.banner.hidden = !failed
        text(this.banner, failed ? this.i18n.t('errors.readActivity') : '')
    }
    clear() {
        this.current = undefined
        clearTimeout(this.toastTimer)
        this.toastKey = undefined
        text(this.toast, '')
        this.items.clear()
        this.outputs.clear()
        this.rows.forEach((row) => row.element.remove())
        this.rows.clear()
        this.artifacts.forEach((node) => node.remove())
        this.artifacts.clear()
        this.infoFields.forEach((node) => node.remove())
        this.infoFields.clear()
        this.search.hide()
        text(this.empty, this.i18n.t('empty.loading'))
        this.empty.hidden = false
        this.result.hidden = this.error.hidden = this.gaps.hidden = true
        this.showError(false)
        this.info.open = false
        this.hasNew = false
        this.setFollow(true)
    }
    update(data: Snapshot) {
        this.current = data
        const expired = data.activity?.state === 'expired'
        if (expired) {
            this.items.clear()
            this.rows.forEach((row) => row.element.remove())
            this.rows.clear()
            this.outputs.clear()
        }
        let changed = false
        for (const item of data.activity?.items ?? [])
            if ((this.items.get(item.id)?.seq ?? -1) < item.seq) {
                this.items.set(item.id, item)
                changed = true
            }
        if (changed && !this.follow) this.hasNew = true
        this.translate()
        this.paint()
        if (changed) this.search.refresh()
    }
    flushSelection() {
        if (hasSelection()) this.setFollow(false)
        else {
            this.paint()
            this.search.refresh()
        }
    }
    private paint() {
        const execution = this.current?.execution
        if (!execution) {
            text(this.empty, this.i18n.t('empty.openExecution'))
            return
        }
        const anchor = !this.follow
            ? [...this.rows.values()]
                  .map((row) => row.element)
                  .find((node) => node.getBoundingClientRect().bottom > this.scroll.getBoundingClientRect().top)
            : undefined
        const anchorTop = anchor?.getBoundingClientRect().top
        const ordered = [...this.items.values()].sort((a, b) => a.firstSeq - b.firstSeq)
        let previous: HTMLElement = this.gaps
        for (const item of ordered) {
            let row = this.rows.get(item.id)
            if (!row) {
                row = new ActivityRow(
                    item,
                    this.i18n,
                    async (target) => {
                        const output = await this.onOutput(target, this.outputFor(target))
                        if (target.content.kind === 'tool' && target.content.outputRef)
                            this.outputs.set(target.content.outputRef.key, output)
                        return output
                    },
                    (value) => {
                        void this.copy(value)
                    }
                )
                this.rows.set(item.id, row)
            }
            if (previous.nextElementSibling !== row.element) previous.after(row.element)
            previous = row.element
            if (row.needsUpdate(item, this.outputFor(item))) row.update(item, this.outputFor(item))
        }
        const activity = this.current?.activity
        this.empty.hidden = !!ordered.length
        const messages = {
            not_recorded: this.i18n.t('empty.notRecorded'),
            expired: this.i18n.t('empty.expired'),
            closed: this.i18n.t('empty.closed'),
            recording: this.i18n.t('empty.recording')
        }
        text(this.empty, messages[activity?.state ?? 'not_recorded'])
        this.gaps.hidden = !activity?.gaps.length
        text(this.gaps, this.i18n.t('view.gaps'))
        if (!hasSelection(this.error)) {
            text(this.error, execution.error ?? '')
            this.error.hidden = !execution.error
        }
        const summary = execution.result?.text ?? ''
        if (!hasSelection(this.result)) {
            this.resultReply.update(summary)
            this.result.hidden = !summary || isDuplicateSummary(summary, ordered)
        }
        for (const file of execution.result?.artifacts ?? []) {
            const key = `${file.id}:${file.versionId ?? ''}`
            let download = this.artifacts.get(key)
            if (!download) {
                const control = button('', () => {
                    control.disabled = true
                    void this.onDownload(file)
                        .catch(() => this.notify('feedback.downloadFailed'))
                        .finally(() => {
                            control.disabled = !file.versionId
                        })
                })
                control.append(icon('download'), el('span', '', 'artifact-name'))
                control.disabled = !file.versionId
                this.artifacts.set(key, control)
                this.files.append(control)
                download = control
            }
            if (!hasSelection(download)) {
                const name = file.name ?? this.i18n.t('files.download')
                text(download.querySelector<HTMLElement>('.artifact-name')!, name)
                download.title = name
                download.setAttribute('aria-label', name)
            }
        }
        const fields = [
            ['id', this.i18n.t('metadata.id'), execution.id],
            ['version', this.i18n.t('metadata.version'), execution.tool?.version],
            ['cwd', this.i18n.t('metadata.directory'), execution.workingDirectory],
            ['created', this.i18n.t('metadata.created'), this.i18n.formatDate(execution.createdAt)],
            ['observed', this.i18n.t('metadata.observed'), this.i18n.formatDate(execution.updatedAt)],
            ['boundary', '', this.i18n.t('metadata.boundary')]
        ]
        for (const [key, title, value] of fields) {
            let field = this.infoFields.get(key ?? '')
            if (!field) {
                field = el('p')
                this.infoFields.set(key ?? '', field)
                this.infoBody.append(field)
            }
            if (!hasSelection(field))
                text(field, value ? (title ? this.i18n.t('metadata.field', { label: title, value }) : value) : '')
        }
        if (anchor && anchorTop !== undefined && anchor.isConnected)
            this.scroll.scrollTop += anchor.getBoundingClientRect().top - anchorTop
        this.updateFollow()
        if (this.follow && !hasSelection()) this.scroll.scrollTop = this.scroll.scrollHeight
    }
    private outputFor(item: Activity) {
        return item.content.kind === 'tool' && item.content.outputRef
            ? this.outputs.get(item.content.outputRef.key)
            : undefined
    }
    private setFollow(value: boolean) {
        this.follow = value
        if (value) {
            this.hasNew = false
            this.scroll.scrollTop = this.scroll.scrollHeight
        }
        this.updateFollow()
    }
    private updateFollow() {
        this.updateHeader()
        const running =
            !this.current?.execution || !['succeeded', 'failed', 'cancelled'].includes(this.current.execution.status)
        text(
            this.followText,
            this.follow
                ? running
                    ? this.i18n.t('follow.following')
                    : this.i18n.t('follow.end')
                : this.i18n.t('follow.paused')
        )
        this.latest.hidden = this.follow || !this.hasNew
    }
    private updateHeader() {
        const execution = this.current?.execution
        this.header.update({
            title: execution
                ? this.i18n.t('header.title', {
                      executor:
                          codingToolBrand({ toolId: execution.tool?.id, provider: execution.provider })?.name ??
                          execution.tool?.id ??
                          execution.provider
                  })
                : this.i18n.t('header.defaultTitle'),
            toolId: execution?.tool?.id,
            provider: execution?.provider,
            status: execution?.status,
            following: this.follow,
            palette: this.palette,
            i18n: this.i18n
        })
    }
    private copyAll() {
        const parts = [...this.items.values()]
            .sort((a, b) => a.firstSeq - b.firstSeq)
            .map((item) => activityText(item, this.i18n, this.outputFor(item)))
        const summary = this.current?.execution?.result?.text
        if (summary && !isDuplicateSummary(summary, this.items.values())) parts.push(summary)
        return parts.join('\n\n')
    }
    private async copy(value: string) {
        try {
            await copyText(value)
            this.notify('feedback.copied')
        } catch {
            this.notify('feedback.copyUnavailable')
        }
    }
    private notify(key: NonNullable<ExecutionView['toastKey']>) {
        clearTimeout(this.toastTimer)
        this.toastKey = key
        text(this.toast, this.i18n.t(key))
        this.toastTimer = window.setTimeout(() => {
            this.toastKey = undefined
            text(this.toast, '')
        }, 3500)
    }
    private onKey(event: KeyboardEvent) {
        const target = event.target
        if (!(target instanceof HTMLElement) || event.isComposing) return
        if (target.closest('input,textarea,select,[contenteditable="true"]')) return
        if (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key === 'f')) {
            event.preventDefault()
            this.setFollow(false)
            this.search.show()
            return
        }
        if (event.key === 'Escape' && !this.search.element.hidden) {
            this.search.hide()
            return
        }
        if (hasSelection() || target.closest('button,a,summary')) return
        const rows = [...this.transcript.querySelectorAll<HTMLElement>('.activity-record')]
        const current = target.closest<HTMLElement>('.activity-record')
        const index = current ? rows.indexOf(current) : -1
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            this.setFollow(false)
            rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
        } else if (event.key === 'Enter' && current) {
            const details = current.querySelector<HTMLDetailsElement>(
                '.tool-record:not([hidden]), .json-branch:not([hidden])'
            )
            if (details) {
                event.preventDefault()
                details.open = !details.open
            }
        }
    }
}
