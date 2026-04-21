function manuallySanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "undefined"
  ) {
    return value
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return undefined
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof URL) {
    return value.toString()
  }

  if (value instanceof RegExp) {
    return value.toString()
  }

  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return value.slice(0)
  }

  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
    if ("length" in value) {
      return Array.from(value as unknown as ArrayLike<number>)
    }

    return {
      byteLength: value.byteLength,
    }
  }

  if (value instanceof Map) {
    return Array.from(value.entries(), ([key, mapValue]) => [
      manuallySanitizeValue(key, seen),
      manuallySanitizeValue(mapValue, seen),
    ])
  }

  if (value instanceof Set) {
    return Array.from(value.values(), (setValue) =>
      manuallySanitizeValue(setValue, seen),
    )
  }

  if (typeof value !== "object") {
    return String(value)
  }

  if (seen.has(value)) {
    return "[Circular]"
  }

  seen.add(value)

  if (Array.isArray(value)) {
    const sanitizedArray = value.map((entry) =>
      manuallySanitizeValue(entry, seen),
    )
    seen.delete(value)
    return sanitizedArray
  }

  const sanitizedObject: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const sanitizedEntry = manuallySanitizeValue(entry, seen)
    if (sanitizedEntry !== undefined) {
      sanitizedObject[key] = sanitizedEntry
    }
  }

  seen.delete(value)
  return sanitizedObject
}

export function toStructuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value)
    } catch {
      // Fall through to best-effort sanitization.
    }
  }

  return manuallySanitizeValue(value, new WeakSet()) as T
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
