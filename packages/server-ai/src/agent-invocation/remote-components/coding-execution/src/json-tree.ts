import { el, hasSelection, text } from './dom'
import type { Label } from './model'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** JSON.parse is the trust boundary; downstream tree nodes receive a concrete recursive value. */
export function isJsonValue(value: unknown): value is JsonValue {
    const pending: unknown[] = [value]
    while (pending.length) {
        const item = pending.pop()
        if (item === null || typeof item === 'string' || typeof item === 'boolean') continue
        if (typeof item === 'number' && Number.isFinite(item)) continue
        if (typeof item !== 'object' || !item) return false
        for (const child of Object.values(item)) pending.push(child)
    }
    return true
}

/** Nodes are keyed by their JSON property/index, so updates retain branch state and focus. */
class JsonNode {
    readonly element = el('div', '', 'json-node')
    private branch = el('details', '', 'json-branch')
    private toggle = el('summary', '', 'json-toggle')
    private key = el('span', '', 'json-key searchable')
    private description = el('span', '', 'json-description')
    private children = el('div', '', 'json-children')
    private leaf = el('div', '', 'json-leaf')
    private value = el('span', '', 'json-value searchable')
    private nodes = new Map<string, JsonNode>()
    constructor(path: string, expanded: boolean) {
        this.element.dataset.jsonPath = path
        this.branch.open = expanded
        this.toggle.append(this.description)
        this.branch.append(this.toggle, this.children)
        this.leaf.tabIndex = 0
        this.leaf.append(this.value)
        this.element.append(this.branch, this.leaf)
    }
    update(value: JsonValue, name: string | number | null, label: Label) {
        const collection = value !== null && typeof value === 'object'
        const array = Array.isArray(value)
        this.branch.hidden = !collection
        this.leaf.hidden = collection
        const heading = collection ? this.toggle : this.leaf
        if (this.key.parentNode !== heading) heading.prepend(this.key)
        text(this.key, name === null ? '' : `${typeof name === 'number' ? `[${name}]` : JSON.stringify(name)}: `)
        if (!collection) {
            this.value.dataset.jsonKind = value === null ? 'null' : typeof value
            text(this.value, JSON.stringify(value))
            this.nodes.forEach((node) => node.element.remove())
            this.nodes.clear()
            return
        }
        const entries = Object.entries(value)
        const shape = array ? (entries.length ? '[…]' : '[]') : entries.length ? '{…}' : '{}'
        text(
            this.description,
            `${shape} · ${entries.length} ${array ? label('items', '项') : label('fields', '个字段')}`
        )
        const keys = new Set(entries.map(([key]) => key))
        for (const [key, node] of this.nodes) {
            if (keys.has(key)) continue
            node.element.remove()
            this.nodes.delete(key)
        }
        let cursor = this.children.firstElementChild
        for (const [key, child] of entries) {
            let node = this.nodes.get(key)
            if (!node) {
                const path = `${this.element.dataset.jsonPath}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
                node = new JsonNode(path, false)
                this.nodes.set(key, node)
            }
            node.update(child, array ? Number(key) : key, label)
            if (node.element !== cursor) this.children.insertBefore(node.element, cursor)
            cursor = node.element.nextElementSibling
        }
    }
}

export class JsonTree {
    readonly element = el('div', '', 'json-tree')
    private root?: JsonNode
    constructor(private label: Label) {
        this.element.addEventListener('keydown', (event) => this.onKey(event))
    }
    update(value: JsonValue, expanded: boolean) {
        if (!this.root) {
            this.root = new JsonNode('', expanded)
            this.element.append(this.root.element)
        }
        this.element.setAttribute('aria-label', this.label('JSON tree', 'JSON 树'))
        this.root.update(value, null, this.label)
    }
    private onKey(event: KeyboardEvent) {
        if (
            !(event.target instanceof HTMLElement) ||
            event.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            hasSelection(this.element)
        )
            return
        const target = event.target.closest<HTMLElement>('.json-toggle, .json-leaf')
        if (!target) return
        const branch = target.parentElement instanceof HTMLDetailsElement ? target.parentElement : null
        const parentBranch = target.parentElement?.closest('.json-children')?.parentElement
        if (event.key === 'ArrowRight' && branch) {
            if (branch.open) {
                branch
                    .querySelector('.json-children')
                    ?.firstElementChild?.querySelector<HTMLElement>(
                        '.json-branch:not([hidden]) > summary, .json-leaf:not([hidden])'
                    )
                    ?.focus()
            } else branch.open = true
        } else if (event.key === 'ArrowLeft') {
            if (branch?.open) branch.open = false
            else parentBranch?.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true })
        } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            const visible = [...this.element.querySelectorAll<HTMLElement>('.json-toggle, .json-leaf')].filter(
                (node) => {
                    if (node.closest('[hidden]')) return false
                    for (
                        let parent = node.parentElement;
                        parent && parent !== this.element;
                        parent = parent.parentElement
                    ) {
                        if (parent instanceof HTMLDetailsElement && !parent.open && node !== parent.firstElementChild)
                            return false
                    }
                    return true
                }
            )
            const index = visible.indexOf(target)
            const next =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? visible.length - 1
                      : index + (event.key === 'ArrowDown' ? 1 : -1)
            visible[Math.max(0, Math.min(visible.length - 1, next))]?.focus()
        } else if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
            if (branch && event.key !== 'ArrowRight') return
        } else return
        event.preventDefault()
        event.stopPropagation()
    }
}
