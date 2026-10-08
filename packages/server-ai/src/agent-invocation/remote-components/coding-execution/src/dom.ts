import search from 'remixicon/icons/System/search-line.svg'
import copy from 'remixicon/icons/Document/file-copy-line.svg'
import download from 'remixicon/icons/System/download-2-line.svg'
import close from 'remixicon/icons/System/close-line.svg'
import up from 'remixicon/icons/Arrows/arrow-up-line.svg'
import down from 'remixicon/icons/Arrows/arrow-down-line.svg'
import check from 'remixicon/icons/System/checkbox-circle-fill.svg'
import error from 'remixicon/icons/System/close-circle-line.svg'
import running from 'remixicon/icons/System/loader-4-line.svg'
import pause from 'remixicon/icons/Media/pause-line.svg'

export const icons = { search, copy, download, close, up, down, check, error, running, pause }
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', classes = '') {
    const node = document.createElement(tag)
    if (text) node.append(document.createTextNode(text))
    node.className = classes
    return node
}
export function icon(name: keyof typeof icons) {
    const node = el('span', '', 'icon')
    node.setAttribute('aria-hidden', 'true')
    // Static Remix Icon assets only. Activity content always uses text nodes.
    node.innerHTML = icons[name]
    return node
}
export function button(title: string, action: () => void, name?: keyof typeof icons) {
    const node = el('button', '', 'quiet-button')
    node.type = 'button'
    node.title = title
    node.setAttribute('aria-label', title)
    if (name) node.append(icon(name))
    else node.append(document.createTextNode(title))
    node.onclick = action
    return node
}
export function hasSelection(node?: Node) {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false
    return !node || selection.getRangeAt(0).intersectsNode(node)
}
export function text(node: HTMLElement, value: string) {
    if (node.textContent === value) return
    const child = node.firstChild
    if (child instanceof Text && node.childNodes.length === 1) {
        if (value.startsWith(child.data)) child.appendData(value.slice(child.length))
        else child.replaceData(0, child.length, value)
    } else node.replaceChildren(document.createTextNode(value))
}
export async function copyText(value: string) {
    // Sandboxed Remote Views may not receive clipboard permissions. Copy synchronously first.
    const active = document.activeElement
    const selection = window.getSelection()
    const ranges = selection
        ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
        : []
    const area = el('textarea', '', 'clipboard-buffer')
    area.value = value
    document.body.append(area)
    area.focus({ preventScroll: true })
    area.select()
    let copied = false
    try {
        copied = document.execCommand('copy')
    } catch {
        /* Try the permitted Clipboard API below. */
    }
    area.remove()
    if (active instanceof HTMLElement) active.focus({ preventScroll: true })
    if (selection) {
        selection.removeAllRanges()
        ranges.forEach((range) => selection.addRange(range))
    }
    if (!copied) await navigator.clipboard.writeText(value)
}
