import { button, el, hasSelection, text } from './dom'
import type { Label } from './model'

export class TranscriptSearch {
    readonly element = el('div', '', 'search-bar')
    readonly input = el('input')
    private count = el('span', '', 'search-count')
    private previous = button('', () => this.move(-1), 'up')
    private next = button('', () => this.move(1), 'down')
    private close = button('', () => this.hide(), 'close')
    private matches: Range[] = []
    private index = -1
    private currentRecord?: HTMLElement
    private returnFocus?: HTMLElement
    constructor(
        private transcript: HTMLElement,
        private label: Label,
        private prepare: (query: string) => void
    ) {
        this.element.hidden = true
        this.element.setAttribute('role', 'search')
        this.input.type = 'search'
        this.input.maxLength = 256
        this.input.oninput = () => {
            this.index = -1
            this.refresh()
            this.move(1)
        }
        this.input.onkeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                this.hide()
            } else if (event.key === 'Enter') {
                event.preventDefault()
                this.move(event.shiftKey ? -1 : 1)
            }
        }
        this.element.append(this.input, this.count, this.previous, this.next, this.close)
        this.translate()
    }
    translate() {
        this.input.placeholder = this.label('Search loaded activity…', '搜索已加载的过程…')
        this.input.setAttribute('aria-label', this.input.placeholder)
        for (const [node, en, cn] of [
            [this.previous, 'Previous match', '上个匹配'],
            [this.next, 'Next match', '下个匹配'],
            [this.close, 'Close search', '关闭搜索']
        ] as const) {
            node.title = this.label(en, cn)
            node.setAttribute('aria-label', node.title)
        }
    }
    show() {
        if (document.activeElement instanceof HTMLElement) this.returnFocus = document.activeElement
        this.element.hidden = false
        this.input.focus()
    }
    hide() {
        this.element.hidden = true
        this.input.value = ''
        this.refresh()
        this.returnFocus?.focus({ preventScroll: true })
    }
    refresh() {
        if (hasSelection()) return
        const query = this.input.value.toLocaleLowerCase()
        const old = this.matches[this.index]
        this.prepare(query)
        this.matches = []
        if (query)
            for (const block of this.transcript.querySelectorAll<HTMLElement>('.searchable')) {
                if (block.hidden || block.closest('[hidden]')) continue
                const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    const value = node.textContent?.toLocaleLowerCase() ?? ''
                    for (
                        let at = value.indexOf(query);
                        at >= 0 && this.matches.length < 2000;
                        at = value.indexOf(query, at + query.length)
                    ) {
                        const range = document.createRange()
                        range.setStart(node, at)
                        range.setEnd(node, at + query.length)
                        this.matches.push(range)
                    }
                }
            }
        const same = old
            ? this.matches.findIndex(
                  (r) => r.startContainer === old.startContainer && r.startOffset === old.startOffset
              )
            : -1
        this.index = same >= 0 ? same : Math.min(this.index, this.matches.length - 1)
        if (typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && CSS.highlights) {
            CSS.highlights.set('execution-search', new Highlight(...this.matches))
        }
        this.mark(false)
    }
    move(direction: number) {
        if (!this.matches.length) return
        this.index = (this.index + direction + this.matches.length) % this.matches.length
        this.mark(true)
    }
    private mark(scroll: boolean) {
        this.currentRecord?.classList.remove('search-current')
        const range = this.matches[this.index]
        const parent = range?.startContainer.parentElement
        this.currentRecord = parent?.closest<HTMLElement>('.activity-record') ?? undefined
        this.currentRecord?.classList.add('search-current')
        if (typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && CSS.highlights) {
            CSS.highlights.set('execution-current', new Highlight(...(range ? [range] : [])))
        }
        text(
            this.count,
            this.input.value
                ? `${Math.max(0, this.index + 1)} / ${this.matches.length}${this.matches.length === 2000 ? '+' : ''}`
                : ''
        )
        this.previous.disabled = this.next.disabled = !this.matches.length
        if (scroll && parent) {
            let ancestor: HTMLElement | null = parent
            while (ancestor && ancestor !== this.transcript) {
                if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
                ancestor = ancestor.parentElement
            }
            const viewport = this.transcript.parentElement
            const tree = parent.closest<HTMLElement>('.json-tree')
            if (tree)
                tree.scrollTop +=
                    range.getBoundingClientRect().top - tree.getBoundingClientRect().top - tree.clientHeight / 3
            const rect = range.getBoundingClientRect()
            if (viewport)
                viewport.scrollTop += rect.top - viewport.getBoundingClientRect().top - viewport.clientHeight / 3
        }
    }
}
