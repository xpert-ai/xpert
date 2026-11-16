import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
    applyRemoteComponentTheme,
    Button,
    Tabs,
    TabsContent,
    TabsHeader,
    TabsList,
    TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { connect } from '@xpert-ai/plugin-sdk/remote-component'
import { Library } from './library'
import { Reviews } from './reviews'
import { Dreams } from './dreams'
import { Language, useText } from './shared'
const tabs = ['library', 'reviews', 'runs'] as const
function Memory() {
    const t = useText(),
        [tab, select] = useState('library'),
        [refresh, setRefresh] = useState(0),
        [target, setTarget] = useState<string>(),
        [scope, setScope] = useState(''),
        [studio, setStudio] = useState(false)
    const titles = [t('记忆库', 'Library'), t('复核记录', 'Reviews'), t('Dream 整理', 'Dream runs')]
    return (
        <main className="flex h-full flex-col px-3 pt-3 text-sm min-[621px]:px-5 min-[621px]:pt-4">
            <header className="flex shrink-0 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <h1 className="text-xl font-semibold">{t('长期记忆', 'Long-term memory')}</h1>
                    {scope && <span className="text-xs text-muted-foreground">{scope}</span>}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('刷新', 'Refresh')}
                    onClick={() => setRefresh((n) => n + 1)}
                >
                    <RefreshCw />
                </Button>
            </header>
            <Tabs
                value={tab}
                onValueChange={(value) => {
                    select(value)
                    setTarget(undefined)
                }}
                className="min-h-0 flex-1 gap-0"
            >
                <TabsHeader>
                    <TabsList variant="line" aria-label={t('长期记忆', 'Long-term memory')}>
                        {tabs.map((value, i) => (
                            <TabsTrigger key={value} value={value}>
                                {titles[i]}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </TabsHeader>
                {studio && (
                    <p className="shrink-0 pt-2 text-xs text-muted-foreground">
                        {t('运行数据 · 保存后立即生效', 'Live data · Edits take effect when saved')}
                    </p>
                )}
                <TabsContent value="library" className="min-h-0">
                    <Library
                        refresh={refresh}
                        initialId={target}
                        syncScope={(v, s) => {
                            setScope(v)
                            setStudio(s)
                        }}
                    />
                </TabsContent>
                <TabsContent value="reviews" className="min-h-0 overflow-y-auto">
                    <Reviews
                        refresh={refresh}
                        edit={(id) => {
                            setTarget(id)
                            select('library')
                        }}
                    />
                </TabsContent>
                <TabsContent value="runs" className="min-h-0 overflow-y-auto">
                    <Dreams refresh={refresh} />
                </TabsContent>
            </Tabs>
        </main>
    )
}
function App() {
    const [locale, setLocale] = useState('en-US'),
        [scope, reset] = useState(0)
    useEffect(() => {
        const changed = () => reset((n) => n + 1)
        return connect(({ locale, theme }, newScope) => {
            applyRemoteComponentTheme(locale, theme)
            setLocale(locale)
            if (newScope) changed()
        }, changed)
    }, [])
    return scope ? (
        <Language.Provider value={locale}>
            <Memory key={scope} />
        </Language.Provider>
    ) : null
}
createRoot(document.getElementById('root')!).render(<App />)
