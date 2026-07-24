import * as React from 'react'
import { ResizablePanel } from '@xpert-ai/shadcn-ui'

export type StudioPanelHandle = NonNullable<
	NonNullable<React.ComponentProps<typeof ResizablePanel>['panelRef']> extends React.Ref<infer Handle>
		? Handle
		: never
>

type StudioPanelSize = Parameters<NonNullable<React.ComponentProps<typeof ResizablePanel>['onResize']>>[0]

export function useCollapsiblePanel(collapseThreshold = 8) {
	const panelRef = React.useRef<StudioPanelHandle | null>(null)
	const [collapsed, setCollapsed] = React.useState(false)

	return {
		collapsed,
		panelRef,
		onResize(size: StudioPanelSize) {
			setCollapsed(size.inPixels <= collapseThreshold)
		},
		toggle() {
			if (collapsed) {
				panelRef.current?.expand()
			} else {
				panelRef.current?.collapse()
			}
		}
	}
}

export function useMediaQuery(query: string) {
	const [matches, setMatches] = React.useState(() => window.matchMedia(query).matches)

	React.useEffect(() => {
		const mediaQuery = window.matchMedia(query)
		const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches)
		setMatches(mediaQuery.matches)
		mediaQuery.addEventListener('change', handleChange)
		return () => mediaQuery.removeEventListener('change', handleChange)
	}, [query])

	return matches
}
