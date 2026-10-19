import { test } from "bun:test"
import { strict as assert } from "node:assert"
import { deepRemoveUnderscoreProperties } from "../lib/react/deep-remove-underscore-properties"

const iso = "2026-09-09T00:00:00.000Z"
const serialize = (value: unknown) =>
  JSON.stringify(deepRemoveUnderscoreProperties(value))

test("nested dates retain their JSON timestamp", () => {
  assert.equal(serialize({ start: new Date(iso) }), `{"start":"${iso}"}`)
})

test("a root date retains its JSON timestamp", () => {
  assert.equal(serialize(new Date(iso)), JSON.stringify(iso))
})

test("dates in constructor-argument arrays retain their timestamps", () => {
  const input = [{ dates: [new Date(iso)], _cache: "omit" }, 3]
  assert.equal(serialize(input), `[{"dates":["${iso}"]},3]`)
})

test("invalid dates retain native JSON null behavior", () => {
  assert.equal(serialize({ start: new Date(NaN) }), '{"start":null}')
})

test("ordinary objects still lose internal keys recursively", () => {
  const input = { _cache: 1, keep: [{ _private: 2, value: 3 }] }
  assert.equal(serialize(input), '{"keep":[{"value":3}]}')
})

test("input objects and dates are not mutated", () => {
  const date = new Date(iso)
  const input = Object.freeze({ date, _cache: 2 })
  serialize(input)
  assert.equal(date.toISOString(), iso)
  assert.equal(input._cache, 2)
  assert.equal(input.date, date)
})

test("null and primitive values retain native JSON behavior", () => {
  const input = [null, 0, false, "text"]
  assert.equal(serialize(input), JSON.stringify(input))
})
