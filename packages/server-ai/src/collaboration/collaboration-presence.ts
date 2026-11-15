import type { ICollaborationPresence } from '@xpert-ai/plugin-sdk'
import { clamp, optionalBase64, optionalText, requiredText } from './collaboration-input'

/** Enforce presence size semantics before data reaches Redis or another client. */
export function sanitizePresence(value: ICollaborationPresence): ICollaborationPresence {
    return {
        clientId: requiredText(value.clientId, 'clientId', 128),
        presenceId: requiredText(value.presenceId, 'presenceId', 128),
        actorType: value.actorType,
        displayName: requiredText(value.displayName, 'displayName', 64),
        color: requiredText(value.color, 'color', 32),
        avatarUrl: optionalText(value.avatarUrl, 2_048) ?? null,
        pageId: optionalText(value.pageId, 256) ?? null,
        pointer:
            value.pointer && Number.isFinite(value.pointer.x) && Number.isFinite(value.pointer.y)
                ? {
                      pageId: optionalText(value.pointer.pageId, 256) ?? null,
                      x: clamp(value.pointer.x, 0, 1),
                      y: clamp(value.pointer.y, 0, 1),
                      visible: value.pointer.visible !== false
                  }
                : null,
        focus: value.focus
            ? {
                  kind: requiredText(value.focus.kind, 'focus kind', 64),
                  key: optionalText(value.focus.key, 512) ?? null,
                  pageId: optionalText(value.focus.pageId, 256) ?? null,
                  elementId: optionalText(value.focus.elementId, 256) ?? null,
                  fieldKey: optionalText(value.focus.fieldKey, 512) ?? null
              }
            : null,
        selection: sanitizeSelection(value.selection),
        viewport:
            value.viewport &&
            Number.isFinite(value.viewport.zoom) &&
            Number.isFinite(value.viewport.width) &&
            Number.isFinite(value.viewport.height)
                ? {
                      zoom: clamp(value.viewport.zoom, 0.05, 16),
                      width: clamp(value.viewport.width, 1, 100_000),
                      height: clamp(value.viewport.height, 1, 100_000)
                  }
                : null,
        mode: optionalText(value.mode, 64) ?? null,
        status: value.status ?? null,
        toolName: optionalText(value.toolName, 160) ?? null,
        operationLabel: optionalText(value.operationLabel, 256) ?? null,
        updatedAt: Date.now()
    }
}

export function sanitizeCellRange(
    value: unknown
): NonNullable<NonNullable<ICollaborationPresence['selection']>['cells']> | null {
    if (
        !value ||
        typeof value !== 'object' ||
        !('sheetId' in value) ||
        typeof value.sheetId !== 'string' ||
        !value.sheetId ||
        value.sheetId.length > 256 ||
        !('startRow' in value) ||
        !('endRow' in value) ||
        !('startColumn' in value) ||
        !('endColumn' in value)
    )
        return null
    const { sheetId, startRow, endRow, startColumn, endColumn } = value
    if (
        typeof startRow !== 'number' ||
        typeof endRow !== 'number' ||
        typeof startColumn !== 'number' ||
        typeof endColumn !== 'number' ||
        ![startRow, endRow, startColumn, endColumn].every(Number.isSafeInteger) ||
        startRow < 0 ||
        startColumn < 0 ||
        endRow < startRow ||
        endColumn < startColumn ||
        endRow > 1048575 ||
        endColumn > 16383
    )
        return null
    const baseRevision = 'baseRevision' in value ? value.baseRevision : undefined
    if (
        baseRevision !== undefined &&
        (typeof baseRevision !== 'number' || !Number.isSafeInteger(baseRevision) || baseRevision < 1)
    )
        return null
    return {
        sheetId,
        startRow,
        endRow,
        startColumn,
        endColumn,
        ...(typeof baseRevision === 'number' ? { baseRevision } : {})
    }
}

function sanitizeSelection(selection: ICollaborationPresence['selection']) {
    if (!selection) return null
    if (selection.kind === 'cells') {
        const cells = sanitizeCellRange(selection.cells)
        return cells ? { kind: 'cells' as const, cells } : null
    }
    return {
        kind: selection.kind,
        fieldKey: optionalText(selection.fieldKey, 512) ?? null,
        elementIds: selection.elementIds?.slice(0, 128).map((item) => requiredText(item, 'elementId', 256)) ?? null,
        anchorRelativeBase64: optionalBase64(selection.anchorRelativeBase64, 8_192),
        headRelativeBase64: optionalBase64(selection.headRelativeBase64, 8_192)
    }
}
