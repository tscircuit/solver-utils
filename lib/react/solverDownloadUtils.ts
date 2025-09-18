import type { BaseSolver } from "../BaseSolver"

export const deepRemoveUnderscoreProperties = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(deepRemoveUnderscoreProperties)
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!key.startsWith("_")) {
      result[key] = deepRemoveUnderscoreProperties(value)
    }
  }
  return result
}

export const sanitizeConstructorParams = (params: unknown): unknown =>
  deepRemoveUnderscoreProperties(params)

export const stringifyForDownload = (value: unknown): string =>
  JSON.stringify(value, null, 2)

export const triggerDownload = (
  filename: string,
  contents: string,
  mimeType = "text/plain",
) => {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof Blob === "undefined"
  ) {
    console.warn(
      `Download attempted for "${filename}" in a non-browser environment.`,
    )
    return
  }

  try {
    const blob = new Blob([contents], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown error: ${String(error)}`
    console.error(`Failed to download ${filename}: ${message}`)
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`Failed to download ${filename}: ${message}`)
    }
  }
}

export const getConstructorParamsSafely = (
  solver: BaseSolver,
): { sanitized: unknown; raw: unknown } | null => {
  try {
    const rawParams = solver.getConstructorParams()
    const sanitized = sanitizeConstructorParams(rawParams)
    return { raw: rawParams, sanitized }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown error: ${String(error)}`
    const solverName = solver.constructor.name
    const fullMessage = `Unable to retrieve constructor params for ${solverName}: ${message}`
    console.error(fullMessage)
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(fullMessage)
    }
    return null
  }
}
