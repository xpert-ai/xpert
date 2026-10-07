import { ActivityRow } from './activity-row'
import { ExecutionHeader, type Palette } from './header'
import { button, copyText, el, hasSelection, icon, text } from './dom'
import {
    activityText,
    isDuplicateSummary,
    type Activity,
    type Execution,
    type Label,
    type Output,
    type Snapshot
} from './model'
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
    private latest = button('', () => this.setFollow(true), 'down')
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
    constructor(
        private label: Label,
        private onOutput: (item: Activity, previous?: Output) => Promise<Output>,
        private onDownload: (file: NonNullable<NonNullable<Execution['result']>['artifacts']>[number]) => Promise<void>
    ) {
        this.resultReply = new ReplyContent(label, (value) => void this.copy(value))
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
        this.search = new TranscriptSearch(this.transcript, label, (query) => {
            if (!query) return
            for (const item of this.items.values())
                if (activityText(item, this.outputFor(item)).toLocaleLowerCase().includes(query))
                    this.rows.get(item.id)?.reveal()
        })
        this.transcript.append(this.empty, this.gaps)
        this.scroll.append(this.transcript)
        this.transcript.append(this.error, this.result, this.files)
        this.info.append(this.infoTitle, this.infoBody)
        this.footer.append(this.followText, this.toast, this.info, this.shortcuts)
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
        const locale = this.label('en', 'zh')
        if (locale === this.locale) return
        this.locale = locale
        this.element.lang = locale
        this.transcript.setAttribute('aria-label', this.label('Execution activity', '执行过程'))
        this.scroll.setAttribute('aria-label', this.label('Execution transcript', '执行过程流'))
        text(this.infoTitle, this.label('Technical info', '技术信息'))
        text(this.shortcuts, this.label('↑↓ Records · Enter Expand · / Search', '↑↓ 记录 · Enter 展开 · / 搜索'))
        this.latest.replaceChildren(
            document.createTextNode(this.label('New output · Jump to latest', '有新输出 · 回到最新')),
            icon('down')
        )
        this.search.translate()
        this.updateFollow()
    }
    showError(message: string) {
        this.banner.hidden = !message
        text(this.banner, message)
    }
    clear() {
        this.current = undefined
        this.items.clear()
        this.outputs.clear()
        this.rows.forEach((row) => row.element.remove())
        this.rows.clear()
        this.artifacts.forEach((node) => node.remove())
        this.artifacts.clear()
        this.infoFields.forEach((node) => node.remove())
        this.infoFields.clear()
        this.search.hide()
        text(this.empty, this.label('Loading execution…', '正在读取执行过程…'))
        this.empty.hidden = false
        this.result.hidden = this.error.hidden = this.gaps.hidden = true
        this.showError('')
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
            text(this.empty, this.label('Open an execution card to view its activity.', '请从运行卡片或执行记录打开。'))
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
                    this.label,
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
            not_recorded: this.label(
                'No activity was recorded for this execution. Saved results remain available.',
                '此执行未采集过程；已有结果仍可查看。'
            ),
            expired: this.label(
                'Activity retention has expired. Saved results remain available.',
                '过程记录已过保存期；已有结果仍可查看。'
            ),
            closed: this.label('No public activity was captured.', '没有捕获到公开过程记录。'),
            recording: this.label('Waiting for public CLI activity…', '正在等待 CLI 公开活动…')
        }
        text(this.empty, messages[activity?.state ?? 'not_recorded'])
        this.gaps.hidden = !activity?.gaps.length
        text(
            this.gaps,
            this.label(
                'Some activity is missing or truncated. Showing captured records.',
                '部分过程缺失或被截断，以下展示已捕获记录。'
            )
        )
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
            if (this.artifacts.has(key)) continue
            const download = button(file.name ?? this.label('Download file', '下载文件'), () => {
                download.disabled = true
                void this.onDownload(file)
                    .catch(() => this.notify(this.label('Download failed. Retry', '下载失败，请重试')))
                    .finally(() => {
                        download.disabled = !file.versionId
                    })
            })
            download.prepend(icon('download'))
            download.disabled = !file.versionId
            this.artifacts.set(key, download)
            this.files.append(download)
        }
        const fields = [
            ['id', 'ID', execution.id],
            ['version', this.label('Version', '版本'), execution.tool?.version],
            ['cwd', this.label('Working directory', '工作目录'), execution.workingDirectory],
            ['created', this.label('Created', '创建'), new Date(execution.createdAt).toLocaleString(this.locale)],
            [
                'observed',
                this.label('Last observation', '最后观察'),
                new Date(execution.updatedAt).toLocaleString(this.locale)
            ],
            [
                'boundary',
                '',
                this.label(
                    'Execution success is separate from project task acceptance.',
                    '执行成功与项目任务验收分别记录。'
                )
            ]
        ]
        for (const [key, title, value] of fields) {
            let field = this.infoFields.get(key ?? '')
            if (!field) {
                field = el('p')
                this.infoFields.set(key ?? '', field)
                this.infoBody.append(field)
            }
            if (!hasSelection(field)) text(field, value ? `${title ? title + ': ' : ''}${value}` : '')
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
                    ? this.label('Following output', '正在跟随输出')
                    : this.label('End of activity', '已到末尾')
                : this.label('Follow paused', '已暂停跟随')
        )
        this.latest.hidden = this.follow || !this.hasNew
    }
    private updateHeader() {
        const execution = this.current?.execution
        this.header.update({
            title: execution
                ? `${execution.tool?.id ?? execution.provider} · ${this.label('Execution', '执行过程')}`
                : this.label('Coding execution', 'Coding 执行过程'),
            status: execution?.status,
            following: this.follow,
            palette: this.palette,
            label: this.label
        })
    }
    private copyAll() {
        const parts = [...this.items.values()]
            .sort((a, b) => a.firstSeq - b.firstSeq)
            .map((item) => activityText(item, this.outputFor(item)))
        const summary = this.current?.execution?.result?.text
        if (summary && !isDuplicateSummary(summary, this.items.values())) parts.push(summary)
        return parts.join('\n\n')
    }
    private async copy(value: string) {
        try {
            await copyText(value)
            this.notify(this.label('Copied', '已复制'))
        } catch {
            this.notify(this.label('Copy unavailable. Select text to copy.', '复制不可用，请选中文字复制。'))
        }
    }
    private notify(value: string) {
        clearTimeout(this.toastTimer)
        text(this.toast, value)
        this.toastTimer = window.setTimeout(() => text(this.toast, ''), 3500)
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
