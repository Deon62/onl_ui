import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

interface Opt { value: string; label: string; disabled?: boolean }

const textOf = (n: ReactNode): string => {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children)
  return ''
}

/** Flattens <option> children (including fragments and arrays) into a plain list */
function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const el = c as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>
    if (el.type === 'option') {
      const label = textOf(el.props.children)
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: el.props.disabled })
    } else if (el.props.children) collect(el.props.children, out)
  })
  return out
}

export interface SelectProps {
  value?: string
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void
  children?: ReactNode
  className?: string
  disabled?: boolean
  placeholder?: string
  id?: string
  'aria-label'?: string
}

/**
 * Custom dropdown with the same API as a native <select> (value, onChange(e.target.value), <option> children),
 * so it is a drop-in replacement everywhere. The menu is portalled so it is never clipped by cards or modals.
 */
export function Select({ value = '', onChange, children, className, disabled, placeholder, id, ...rest }: SelectProps) {
  const opts = collect(children)
  const selected = opts.find((o) => o.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const listId = useId()

  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const h = Math.min(280, opts.length * 34 + 8)
    const up = r.bottom + h + 8 > window.innerHeight && r.top > h + 8
    setPos({ left: r.left, top: up ? r.top - h - 4 : r.bottom + 4, width: r.width, up })
  }

  useLayoutEffect(() => { if (open) place() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const reflow = () => place()
    document.addEventListener('mousedown', down)
    window.addEventListener('resize', reflow)
    window.addEventListener('scroll', reflow, true)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('resize', reflow)
      window.removeEventListener('scroll', reflow, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const choose = (o: Opt) => {
    if (o.disabled) return
    setOpen(false)
    btn.current?.focus()
    if (o.value !== value) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>)
  }

  const openMenu = () => {
    setActive(Math.max(0, opts.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu() }
      return
    }
    const step = (d: number) => {
      let i = active
      for (let n = 0; n < opts.length; n++) {
        i = (i + d + opts.length) % opts.length
        if (!opts[i].disabled) break
      }
      setActive(i)
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(opts.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[active]) choose(opts[active]) }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); setOpen(false) }
  }

  const sized = /(^|\s|:)w-/.test(className ?? '')

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest['aria-label']}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
        className={cx(
          'inline-flex h-9 items-center justify-between gap-2 rounded-[5px] border bg-surface pl-3 pr-2.5 text-left text-[13px] text-ink transition-colors focus:outline-none disabled:opacity-60',
          open ? 'border-primary' : 'border-line hover:border-[color-mix(in_srgb,var(--line),var(--ink)_18%)] focus-visible:border-primary',
          !sized && 'w-full',
          className,
        )}
      >
        <span className={cx('truncate', !selected && 'text-faint')}>{selected?.label ?? placeholder ?? 'Select...'}</span>
        <ChevronDown size={14} className={cx('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={menu}
          id={listId}
          role="listbox"
          aria-label={rest['aria-label']}
          className="anim-pop fixed z-[100] max-h-[280px] overflow-y-auto rounded-md border border-line bg-card py-1 shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
          style={{ left: pos.left, top: pos.top, minWidth: pos.width, maxWidth: Math.max(pos.width, 320) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {opts.map((o, i) => (
            <li key={o.value + i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}>
              <button
                type="button"
                data-idx={i}
                tabIndex={-1}
                disabled={o.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={cx(
                  'flex w-full items-center gap-2 px-2.5 py-[7px] text-left text-[13px] transition-colors disabled:opacity-50',
                  i === active ? 'bg-subtle' : '',
                  o.value === value ? 'font-medium text-ink' : 'text-ink/85',
                )}
              >
                <Check size={13} className={cx('shrink-0', o.value === value ? 'text-primary' : 'invisible')} />
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
