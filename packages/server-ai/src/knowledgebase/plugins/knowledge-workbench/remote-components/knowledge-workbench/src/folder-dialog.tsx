import { useId, useRef } from 'react'
import {
    Button,
    Input,
    Label,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@xpert-ai/shadcn-ui'
import { t } from './i18n'

export function FolderDialog({
    open,
    onOpenChange,
    name,
    onNameChange,
    loading,
    onCreate
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    name: string
    onNameChange: (name: string) => void
    loading: boolean
    onCreate: () => Promise<void>
}) {
    const formId = useId()
    const trigger = useRef<HTMLElement | null>(null)
    return (
        <Dialog
            open={open}
            onOpenChange={(open) => {
                onOpenChange(open)
                if (!open) {
                    onNameChange('')
                }
            }}
        >
            <DialogContent
                onOpenAutoFocus={() => {
                    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                }}
                onCloseAutoFocus={(event) => {
                    if (trigger.current?.isConnected) {
                        event.preventDefault()
                        trigger.current.focus()
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle>{t('newFolder')}</DialogTitle>
                    <DialogDescription>{t('newFolderDescription')}</DialogDescription>
                </DialogHeader>
                <form
                    id={formId}
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void onCreate()
                    }}
                >
                    <Label htmlFor={`${formId}-name`}>{t('folderName')}</Label>
                    <Input
                        id={`${formId}-name`}
                        value={name}
                        placeholder={t('folderNamePlaceholder')}
                        onChange={(event) => onNameChange(event.target.value)}
                    />
                </form>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">
                            {t('cancel')}
                        </Button>
                    </DialogClose>
                    <Button type="submit" form={formId} disabled={!name.trim() || loading}>
                        {t('create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
