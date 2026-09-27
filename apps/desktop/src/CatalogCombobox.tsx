import { useId, useState } from 'react'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@xpert-ai/shadcn-ui'
import { Check, ChevronsUpDown } from 'lucide-react'
import { t } from './i18n'

export function CatalogCombobox({
  items,
  label,
  searchLabel,
  disabled,
  value,
  onChange
}: {
  items: { id: string; name: string }[]
  label: string
  searchLabel: string
  disabled?: boolean
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          disabled={disabled}
          className="w-64 max-w-full justify-between font-normal"
        >
          <span className="truncate">{items.find((item) => item.id === value)?.name || label}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[max(20rem,var(--radix-popover-trigger-width))] max-w-[var(--radix-popover-content-available-width)] p-0"
      >
        <Command defaultValue={value}>
          <CommandInput placeholder={searchLabel} aria-label={searchLabel} />
          <CommandList id={listId}>
            <CommandEmpty>{t('No matching results')}</CommandEmpty>
            <CommandGroup>
              {items.map((bot) => (
                <CommandItem
                  key={bot.id}
                  value={bot.id}
                  keywords={[bot.name]}
                  onSelect={() => {
                    onChange(bot.id)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate" title={bot.name}>
                    {bot.name}
                  </span>
                  <Check
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${bot.id === value ? 'opacity-100' : 'opacity-0'}`}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
