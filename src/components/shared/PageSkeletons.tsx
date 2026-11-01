import type { CSSProperties, ReactNode } from 'react'
import { Spinner } from './Spinner'

/**
 * Loading skeletons - one per page, mirroring that page's real layout (KPI count, column ratios,
 * chart types, tables). Keep in sync when a page layout changes.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Skel({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cx('skeleton rounded-[4px]', className)} style={style} />
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner size={30} stroke={3} color="var(--primary)" />
      <span className="text-[12.5px]">{label}</span>
    </div>
  )
}

function Box({ children, className, flush }: { children?: ReactNode; className?: string; flush?: boolean }) {
  return <div className={cx('rounded-md border border-line bg-card', !flush && 'p-5', className)}>{children}</div>
}

function Head({ w = 'w-40', sub = true }: { w?: string; sub?: boolean }) {
  return (
    <div>
      <Skel className={cx('h-3.5', w)} />
      {sub && <Skel className="mt-2 h-3 w-56 max-w-full" />}
    </div>
  )
}

/** Page action row (right aligned), sized like the real buttons and filters */
function Actions({ widths }: { widths: string[] }) {
  return <div className="mb-5 flex justify-end gap-2">{widths.map((w, i) => <Skel key={i} className={cx('h-9', w)} />)}</div>
}

function Kpis({ n, grid }: { n: number; grid: string }) {
  return (
    <div className={cx('grid gap-3', grid)}>
      {Array.from({ length: n }, (_, i) => (
        <Box key={i}>
          <div className="flex justify-between"><Skel className="h-3 w-24" /><Skel className="h-4 w-4" /></div>
          <Skel className="mt-4 h-6 w-32" />
        </Box>
      ))}
    </div>
  )
}

type ChartKind = 'area' | 'line' | 'bars' | 'hbars' | 'list'
const BAR_H = [42, 58, 35, 66, 51, 74, 47, 62, 80, 55, 69, 44, 76, 60, 52, 71, 64, 83]
const WAVE = [62, 55, 60, 45, 50, 38, 44, 30, 36, 28, 34, 22]

function Gridlines() {
  return (
    <div className="absolute inset-0 flex flex-col justify-between py-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-line-soft" />)}
    </div>
  )
}

function ChartShape({ kind, h, n = 18 }: { kind: ChartKind; h: number; n?: number }) {
  if (kind === 'area' || kind === 'line') {
    const x = (i: number) => `${(i / (WAVE.length - 1)) * 100}%`
    const top = WAVE.map((y, i) => `${x(i)} ${y}%`).join(', ')
    const clip = kind === 'area'
      ? `polygon(0% 100%, ${top}, 100% 100%)`
      : `polygon(${top}, ${[...WAVE].reverse().map((y, i) => `${x(WAVE.length - 1 - i)} ${y + 3}%`).join(', ')})`
    return (
      <div className="relative" style={{ height: h }}>
        <Gridlines />
        <div className={cx('skeleton absolute inset-0', kind === 'area' && 'opacity-70')} style={{ clipPath: clip }} />
      </div>
    )
  }
  if (kind === 'list') {
    return (
      <div className="flex flex-col justify-center gap-4 px-1" style={{ height: h }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="mb-1.5 flex justify-between"><Skel className="h-3 w-28" /><Skel className="h-3 w-16" /></div>
            <Skel className="h-1.5 rounded-full" style={{ width: `${92 - i * 18}%` }} />
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'hbars') {
    return (
      <div className="flex flex-col justify-center gap-4 px-1" style={{ height: h }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3"><Skel className="h-3 w-24 shrink-0" /><Skel className="h-4" style={{ width: `${70 - i * 13}%` }} /></div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-end gap-[6px] border-b border-line-soft" style={{ height: h }}>
      {Array.from({ length: n }, (_, i) => <div key={i} className="skeleton flex-1 rounded-t-[3px]" style={{ height: `${BAR_H[i % BAR_H.length]}%` }} />)}
    </div>
  )
}

function Chart({ kind, h, legend, className, n }: { kind: ChartKind; h: number; legend?: number; className?: string; n?: number }) {
  return (
    <Box className={className}>
      <Head />
      {!!legend && <div className="mt-3 flex flex-wrap gap-4">{Array.from({ length: legend }, (_, i) => <Skel key={i} className="h-3 w-24" />)}</div>}
      <div className="mt-4"><ChartShape kind={kind} h={h - 12} n={n} /></div>
    </Box>
  )
}

function Table({ rows = 8, title = true, toolbar = false, cols = 5, className }: { rows?: number; title?: boolean; toolbar?: boolean; cols?: number; className?: string }) {
  return (
    <Box flush className={className}>
      {(title || toolbar) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          {title ? <Skel className="h-3.5 w-36" /> : <span />}
          {toolbar && <div className="flex gap-2"><Skel className="hidden h-9 w-56 sm:block" /><Skel className="h-9 w-24" /><Skel className="h-9 w-24" /></div>}
        </div>
      )}
      <div className="flex gap-6 border-b border-line-soft px-5 py-2.5">
        {Array.from({ length: cols }, (_, i) => <Skel key={i} className={cx('h-2.5', i === 0 ? 'w-24' : 'w-16', i > 2 && 'hidden md:block', i === cols - 1 && 'ml-auto')} />)}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-line-soft px-5 py-[13px] last:border-0">
          <Skel className="h-3 w-28" />
          {cols > 3 && <Skel className="hidden h-3 w-24 sm:block" />}
          {cols > 4 && <Skel className="hidden h-3 w-32 md:block" />}
          <Skel className="ml-auto h-3 w-20" />
          <Skel className="h-5 w-[72px] rounded-full" />
        </div>
      ))}
    </Box>
  )
}

/** Statement / key-value card: label left, amount right, total line last */
function Lines({ n = 6, className }: { n?: number; className?: string }) {
  return (
    <Box className={className}>
      <Head />
      <div className="mt-5 space-y-3.5">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className={cx('flex justify-between gap-4', i === n - 1 && 'border-t border-line-soft pt-3.5')}>
            <Skel className="h-3" style={{ width: `${40 + ((i * 17) % 30)}%` }} /><Skel className="h-3 w-20" />
          </div>
        ))}
      </div>
    </Box>
  )
}

function Form({ fields = 4, cols = 1, className, button = true }: { fields?: number; cols?: 1 | 2; className?: string; button?: boolean }) {
  return (
    <Box className={className}>
      <Head sub={false} />
      <div className={cx('mt-5 grid gap-4', cols === 2 && 'sm:grid-cols-2')}>
        {Array.from({ length: fields }, (_, i) => <div key={i}><Skel className="h-3 w-24" /><Skel className="mt-2 h-9 w-full" /></div>)}
      </div>
      {button && <div className="mt-5 flex justify-end"><Skel className="h-9 w-24" /></div>}
    </Box>
  )
}

function NoticeBar() { return <Skel className="mb-6 h-12 w-full rounded-md" /> }

function TabsBar({ n = 5 }: { n?: number }) {
  return <div className="mb-5 flex gap-6 border-b border-line pb-3">{Array.from({ length: n }, (_, i) => <Skel key={i} className="h-3.5 w-20" />)}</div>
}

const KPI4 = 'mb-6 sm:grid-cols-2 xl:grid-cols-4'
const DATE_FILTER = 'w-[340px] max-w-full'

const SKELETONS: [RegExp, () => ReactNode][] = [
  [/^\/admin\/?$/, () => (<>
    <Actions widths={[DATE_FILTER]} />
    <Kpis n={6} grid="sm:grid-cols-2 lg:grid-cols-3" />
    <div className="mt-6 grid gap-4 xl:grid-cols-3">
      <Chart kind="area" h={260} className="xl:col-span-2" />
      <Chart kind="list" h={260} />
      <Chart kind="line" h={220} />
      <Chart kind="bars" h={200} legend={2} />
      <Chart kind="bars" h={200} legend={2} n={14} />
      <Chart kind="bars" h={240} legend={5} className="xl:col-span-3" n={30} />
    </div>
    <Table rows={5} className="mt-6" />
  </>)],
  [/^\/merchant\/?$/, () => (<>
    <Actions widths={['w-36']} />
    <Kpis n={5} grid="mb-6 sm:grid-cols-2 xl:grid-cols-5" />
    <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <Chart kind="area" h={280} />
      <Lines n={8} />
    </div>
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <Chart kind="bars" h={190} legend={2} n={12} />
      <Chart kind="list" h={190} />
      <Chart kind="bars" h={190} n={12} />
    </div>
    <Table rows={5} />
  </>)],
  [/^\/admin\/merchants\/[^/]+/, () => (<>
    <Box className="mb-5">
      <div className="flex items-center gap-4">
        <Skel className="h-12 w-12 rounded-full" />
        <div className="flex-1"><Skel className="h-4 w-48" /><Skel className="mt-2 h-3 w-72 max-w-full" /></div>
        <Skel className="hidden h-9 w-28 sm:block" /><Skel className="hidden h-9 w-24 sm:block" />
      </div>
    </Box>
    <Kpis n={5} grid="mb-6 sm:grid-cols-2 xl:grid-cols-5" />
    <TabsBar n={6} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-4"><Chart kind="bars" h={240} n={30} /><Lines n={8} /></div>
      <Lines n={9} />
    </div>
  </>)],
  [/^\/admin\/merchants$/, () => (<><Actions widths={['w-36']} /><Kpis n={4} grid={KPI4} /><Table rows={6} toolbar cols={6} /></>)],
  [/^\/(admin|merchant)\/transactions$/, () => (<><Actions widths={['w-40']} /><Table rows={12} toolbar cols={7} /></>)],
  [/^\/admin\/collections$/, () => (<>
    <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"><Lines n={6} /><Form fields={4} cols={2} /></div>
    <Box className="mb-6">
      <Head />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <div key={i}><Skel className="h-3 w-20" /><Skel className="mt-3 h-5 w-12" /></div>)}
      </div>
    </Box>
    <TabsBar n={4} />
    <Table rows={8} title={false} />
  </>)],
  [/^\/admin\/payouts$/, () => (<>
    <Actions widths={['w-36', 'w-52']} />
    <Kpis n={4} grid={KPI4} />
    <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"><Chart kind="bars" h={230} legend={2} n={30} /><Chart kind="hbars" h={230} /></div>
    <Table rows={8} cols={7} />
  </>)],
  [/^\/admin\/reconciliation$/, () => (<>
    <NoticeBar />
    <div className="mb-6 grid gap-4 xl:grid-cols-2"><Lines n={7} /><Lines n={6} /></div>
    <Table rows={5} cols={7} className="mb-6" />
    <Table rows={4} cols={3} />
  </>)],
  [/^\/admin\/revenue$/, () => (<>
    <Actions widths={[DATE_FILTER]} />
    <Kpis n={4} grid={KPI4} />
    <Chart kind="bars" h={260} legend={4} className="mb-6" n={30} />
    <Table rows={5} cols={6} className="mb-6" />
    <Table rows={5} cols={4} />
  </>)],
  [/^\/admin\/expenses$/, () => (<>
    <Actions widths={[DATE_FILTER, 'w-32']} />
    <Kpis n={4} grid={KPI4} />
    <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><Chart kind="list" h={280} /><Table rows={8} toolbar cols={6} /></div>
  </>)],
  [/^\/admin\/fees$/, () => (<>
    <div className="mb-6 grid gap-4 xl:grid-cols-3"><Form fields={4} cols={2} /><Form fields={4} cols={2} /><Form fields={5} cols={2} /></div>
    <Form fields={6} cols={2} className="mb-6" />
    <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]"><Form fields={4} cols={2} button={false} /><Lines n={6} /><Lines n={5} /></div>
    <Chart kind="bars" h={250} legend={2} n={16} />
  </>)],
  [/^\/admin\/reports$/, () => (<>
    <Actions widths={[DATE_FILTER, 'w-32']} />
    <Kpis n={4} grid={KPI4} />
    <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"><Lines n={10} /><Table rows={6} cols={6} /></div>
    <Table rows={6} cols={6} />
  </>)],
  [/^\/admin\/channels$/, () => (<>
    <NoticeBar />
    <div className="mb-6 grid gap-4 lg:grid-cols-3"><Lines n={4} /><Lines n={4} /><Lines n={4} /></div>
    <Table rows={4} cols={4} />
  </>)],
  [/^\/admin\/activity$/, () => <Table rows={12} toolbar cols={5} />],
  [/^\/admin\/requests$/, () => <Table rows={8} toolbar cols={5} />],
  [/^\/admin\/settings$/, () => (
    <div className="grid gap-4 xl:grid-cols-2"><Form fields={2} cols={2} /><Form fields={1} button={false} /><Lines n={5} /><Lines n={2} /><Form fields={2} button={false} /></div>
  )],
  [/^\/merchant\/payment-links$/, () => (<><Actions widths={['w-44']} /><Kpis n={3} grid="mb-6 sm:grid-cols-3" /><Table rows={6} cols={6} /></>)],
  [/^\/merchant\/payouts$/, () => (<>
    <Actions widths={['w-36']} />
    <Kpis n={4} grid={KPI4} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <Table rows={8} cols={6} />
      <div className="space-y-4"><Lines n={8} /><Lines n={5} /></div>
    </div>
  </>)],
  [/^\/merchant\/sms$/, () => (<>
    <Actions widths={['w-28']} />
    <Kpis n={4} grid={KPI4} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"><Form fields={2} /><Table rows={8} cols={5} /></div>
  </>)],
  [/^\/merchant\/settlement$/, () => (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <Box>
        <div className="flex justify-between"><Skel className="h-3.5 w-44" /><div className="flex gap-2"><Skel className="h-8 w-20" /><Skel className="h-8 w-28" /></div></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3 rounded-md border border-line p-3.5"><Skel className="h-5 w-5" /><div className="flex-1"><Skel className="h-3.5 w-28" /><Skel className="mt-2 h-3 w-44 max-w-full" /></div></div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Skel className="h-3 w-32" /><Skel className="mt-2 h-9 w-full" /></div></div>
        <div className="mt-6 border-t border-line-soft pt-5">
          <Skel className="h-3 w-28" />
          <div className="mt-3 grid gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-14 rounded-md" />)}</div>
        </div>
      </Box>
      <div className="space-y-4"><Lines n={5} /><Lines n={4} /></div>
    </div>
  )],
  [/^\/merchant\/profile$/, () => <div className="grid gap-4 xl:grid-cols-2"><Lines n={6} /><Form fields={4} cols={2} /></div>],
  [/^\/merchant\/settings$/, () => <div className="grid gap-4 xl:grid-cols-2"><Form fields={3} /><div className="space-y-4"><Form fields={2} /><Lines n={4} /></div></div>],
  [/^\/merchant\/help$/, () => <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"><Lines n={7} /><div className="space-y-4"><Form fields={3} /><Lines n={3} /></div></div>],
]

export function PageSkeleton({ path }: { path: string }) {
  const render = SKELETONS.find(([re]) => re.test(path))?.[1]
  return (
    <div aria-busy="true" aria-label="Loading page" className="anim-fade">
      {render ? render() : <PageSpinner />}
    </div>
  )
}
