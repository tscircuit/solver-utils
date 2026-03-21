import { describe, expect, test } from "bun:test"
import {
  getDefaultSelectedStats,
  getNextSelectedStats,
  getStatBoxWidthCh,
  stringifyStatValue,
} from "../lib/react/GenericSolverStatsSummary"

describe("GenericSolverStatsSummary helpers", () => {
  test("limits default stat selection to two entries", () => {
    expect(getDefaultSelectedStats(["samples", "accepted", "uphill"])).toEqual([
      "samples",
      "accepted",
    ])
  })

  test("replaces the oldest selected stat when a third stat is chosen", () => {
    expect(
      getNextSelectedStats(["samples", "accepted"], "uphill", true),
    ).toEqual(["accepted", "uphill"])
  })

  test("formats decimal stats into compact strings", () => {
    expect(stringifyStatValue(12.34)).toBe("12.34")
    expect(stringifyStatValue(0.00123)).toBe("1.2e-3")
  })

  test("reserves enough width for the key and value area", () => {
    expect(getStatBoxWidthCh("samples")).toBeGreaterThanOrEqual(19)
    expect(getStatBoxWidthCh("currentDistance")).toBeGreaterThanOrEqual(27)
  })
})
