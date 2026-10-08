import React, { useId } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import {
    Button,
    Checkbox,
    Label,
    Popover,
    PopoverTrigger,
    PopoverContent,
    RadioGroup,
    RadioGroupItem,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@xpert-ai/shadcn-ui'
import type { Prefs } from './bridge'
import type { Labels } from './i18n'

export function ChoiceSelect({
    label,
    value,
    choices,
    onChange,
    className
}: {
    label: string
    value: string
    choices: { value: string; label: string }[]
    onChange: (value: string) => void
    className?: string
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger aria-label={label} className={className}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
                {choices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export function DisplaySettings({
    labels: l,
    prefs,
    update
}: {
    labels: Labels
    prefs: Prefs
    update: (change: Partial<Prefs>) => void
}) {
    const id = useId()
    return (
        <Popover>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={l.display}>
                            <SlidersHorizontal className="size-4" aria-hidden />
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{l.display}</TooltipContent>
            </Tooltip>
            <PopoverContent
                align="end"
                sideOffset={8}
                collisionPadding={12}
                aria-label={l.display}
                className="w-64 max-w-[calc(100vw_-_1.5rem)] space-y-4"
            >
                <h2 className="text-sm font-medium">{l.display}</h2>
                <fieldset className="space-y-3">
                    <legend className="text-xs text-muted-foreground">{l.nodeStyle}</legend>
                    <RadioGroup
                        value={prefs.style}
                        onValueChange={(value) => {
                            if (value === 'compact' || value === 'summary') update({ style: value })
                        }}
                        aria-label={l.nodeStyle}
                    >
                        {(['compact', 'summary'] as const).map((style) => (
                            <div key={style} className="flex items-center gap-2">
                                <RadioGroupItem id={`${id}-${style}`} value={style} />
                                <Label htmlFor={`${id}-${style}`}>{l[style]}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                </fieldset>
                <div className="flex items-center gap-2 border-t pt-4">
                    <Checkbox
                        id={`${id}-shared`}
                        checked={prefs.showShared}
                        onCheckedChange={(value) => update({ showShared: value === true })}
                    />
                    <Label htmlFor={`${id}-shared`}>{l.shared}</Label>
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`${id}-history`}
                        checked={prefs.showHistory}
                        onCheckedChange={(value) => update({ showHistory: value === true })}
                    />
                    <Label htmlFor={`${id}-history`}>{l.history}</Label>
                </div>
            </PopoverContent>
        </Popover>
    )
}
