import React, { useEffect, useMemo, useRef, useState } from "react"

const MAX_VISIBLE_STATS = 2
const VALUE_WIDTH_CH = 10

export const stringifyStatValue = (value: unknown): string => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value)
    }

    if (Number.isInteger(value)) {
      return String(value)
    }

    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
      return value.toExponential(1)
    }

    return value
      .toFixed(2)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*[1-9])0+$/, "$1")
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (value === null || value === undefined) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const getDefaultSelectedStats = (keys: string[]): string[] => {
  return keys.slice(0, MAX_VISIBLE_STATS)
}

export const getNextSelectedStats = (
  currentKeys: string[],
  key: string,
  checked: boolean,
): string[] => {
  if (!checked) {
    return currentKeys.filter((currentKey) => currentKey !== key)
  }

  const withoutKey = currentKeys.filter((currentKey) => currentKey !== key)
  return [...withoutKey, key].slice(-MAX_VISIBLE_STATS)
}

export const getStatBoxWidthCh = (key: string): number => {
  return Math.max(key.length + VALUE_WIDTH_CH + 2, 18)
}

export interface GenericSolverStatsSummaryProps {
  solverName: string
  stats: Record<string, unknown>
}

export const GenericSolverStatsSummary = ({
  solverName,
  stats,
}: GenericSolverStatsSummaryProps) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const availableKeys = useMemo(() => Object.keys(stats), [stats])
  const storageKey = `solver-debugger-selected-stats:${solverName}`
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const fullStatsJson = useMemo(() => JSON.stringify(stats, null, 2), [stats])
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    getDefaultSelectedStats(availableKeys),
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    try {
      const storedValue = window.localStorage.getItem(storageKey)
      if (!storedValue) {
        return
      }

      const parsedValue = JSON.parse(storedValue)
      if (!Array.isArray(parsedValue)) {
        return
      }

      const nextSelectedKeys = parsedValue
        .filter((value): value is string => typeof value === "string")
        .filter((value) => availableKeys.includes(value))
        .slice(0, MAX_VISIBLE_STATS)

      setSelectedKeys(
        nextSelectedKeys.length > 0
          ? nextSelectedKeys
          : getDefaultSelectedStats(availableKeys),
      )
    } catch {
      setSelectedKeys(getDefaultSelectedStats(availableKeys))
    }
  }, [availableKeys, storageKey])

  useEffect(() => {
    setSelectedKeys((currentKeys) => {
      const validKeys = currentKeys.filter((key) => availableKeys.includes(key))
      if (validKeys.length > 0) {
        return validKeys.slice(0, MAX_VISIBLE_STATS)
      }
      return getDefaultSelectedStats(availableKeys)
    })
  }, [availableKeys])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(selectedKeys))
  }, [selectedKeys, storageKey])

  useEffect(() => {
    if (typeof document === "undefined") {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setIsPickerOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const visibleStats = useMemo(() => {
    return selectedKeys
      .filter((key) => key in stats)
      .slice(0, MAX_VISIBLE_STATS)
      .map((key) => {
        const value = stringifyStatValue(stats[key])
        return {
          key,
          text: `${key}: ${value}`,
          widthCh: getStatBoxWidthCh(key),
        }
      })
  }, [selectedKeys, stats])

  if (availableKeys.length === 0) {
    return null
  }

  return (
    <div className="group relative ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 overflow-visible">
      <div className="ml-auto flex max-w-[120ch] items-center justify-end gap-2 overflow-hidden whitespace-nowrap text-[10px] leading-none text-slate-600">
        {visibleStats.map((stat) => (
          <span
            key={stat.key}
            className="inline-flex h-6 items-center rounded border border-slate-200 bg-slate-50 px-2 font-mono tabular-nums"
            style={{ width: `${stat.widthCh}ch` }}
          >
            {stat.text}
          </span>
        ))}
      </div>

      <div className="relative shrink-0" ref={pickerRef}>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          onClick={() => setIsPickerOpen((open) => !open)}
        >
          Stats
        </button>

        {isPickerOpen && (
          <div className="absolute right-0 z-50 mt-1 min-w-[14rem] rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-md">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              Choose up to {MAX_VISIBLE_STATS}
            </div>
            <div className="space-y-1">
              {availableKeys.map((key) => {
                const checked = selectedKeys.includes(key)
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextSelectedKeys = getNextSelectedStats(
                          selectedKeys,
                          key,
                          event.target.checked,
                        )
                        setSelectedKeys(nextSelectedKeys)
                      }}
                    />
                    <span className="font-mono text-[11px]">{key}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <pre className="pointer-events-none absolute right-0 top-full z-40 mt-1 hidden max-w-[min(40rem,90vw)] overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-slate-100 shadow-xl group-hover:block">
        {fullStatsJson}
      </pre>
    </div>
  )
}
