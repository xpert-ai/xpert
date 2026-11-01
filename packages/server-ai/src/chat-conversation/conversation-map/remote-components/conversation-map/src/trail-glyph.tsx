import React from 'react'
import type { TrailStep } from '../../../../../../../contracts/src/ai/conversation-trail.model'

export function ActivityGlyph({ activity, x, y }: { activity: TrailStep['activity']; x: number; y: number }) {
    return (
        <g transform={`translate(${x} ${y})`} fill="var(--background)" stroke="currentColor">
            {activity === 'task' ? (
                <path d="M-4 -5L5 0L-4 5Z" fill="currentColor" />
            ) : activity === 'change' ? (
                <rect x={-4} y={-4} width={8} height={8} fill="currentColor" />
            ) : activity === 'verify' ? (
                <path d="M0 -5L5 0L0 5L-5 0Z" />
            ) : (
                <circle r={4} strokeDasharray={activity === 'other' ? '2 1' : undefined} />
            )}
            {activity === 'answer' && <circle r={1.5} fill="currentColor" />}
        </g>
    )
}
