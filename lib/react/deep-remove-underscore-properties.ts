export const deepRemoveUnderscoreProperties = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  if (Array.isArray(obj)) {
    return obj.map(deepRemoveUnderscoreProperties)
  }

  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith("_")) {
      result[key] = deepRemoveUnderscoreProperties(value)
    }
  }
  return result
}
