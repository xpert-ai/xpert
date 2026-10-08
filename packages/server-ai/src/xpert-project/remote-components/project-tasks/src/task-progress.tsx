import * as React from 'react'

/** Status remains visible beside the measured progress, including paused and blocked tasks. */
export function TaskProgress({ value, label }: { value: number; label: string }) {
    return (
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <svg
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
                viewBox="0 0 20 20"
                className="size-4 shrink-0 -rotate-90"
                fill="none"
                strokeWidth="2.5"
            >
                <circle cx="10" cy="10" r="7.5" className="stroke-border" />
                <circle
                    cx="10"
                    cy="10"
                    r="7.5"
                    pathLength="100"
                    stroke="currentColor"
                    strokeDasharray={`${value} 100`}
                />
            </svg>
            <span>{Math.floor(value)}%</span>
        </span>
    )
}
