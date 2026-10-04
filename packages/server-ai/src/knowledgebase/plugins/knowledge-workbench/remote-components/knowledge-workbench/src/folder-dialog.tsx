import {
    Button,
    Input,
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
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('newFolder')}</DialogTitle>
                    <DialogDescription>{t('newFolderDescription')}</DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void onCreate()
                    }}
                >
                    <Input
                        autoFocus
                        value={name}
                        placeholder={t('folderNamePlaceholder')}
                        onChange={(event) => onNameChange(event.target.value)}
                    />
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                {t('cancel')}
                            </Button>
                        </DialogClose>
                        <Button type="submit" disabled={!name.trim() || loading}>
                            {t('create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
