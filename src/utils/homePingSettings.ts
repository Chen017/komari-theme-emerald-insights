export function parseHomePingLineCount(value: unknown): number {
  const count = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(count) && count >= 1 && count <= 6 ? count : 3
}

export function parseHomePingTaskOrder(value: unknown): number[] {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
      if (typeof raw === 'number')
        raw = [raw]
    }
    catch {
      raw = value.split(/[,，]/)
    }
  }
  if (!Array.isArray(raw))
    return []

  const ids = raw.map(id => typeof id === 'number' || typeof id === 'string' ? Number(id) : NaN)
  return [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))]
}

export function selectHomePingTasks<T extends { taskId: number, name: string }>(
  tasks: T[],
  count: number,
  preferredIds: number[],
  legacyNames: string[],
): (T | null)[] {
  const byId = new Map(tasks.map(task => [task.taskId, task]))
  const ids = preferredIds.length
    ? preferredIds
    : legacyNames.flatMap(name => tasks.filter(task => task.name === name).map(task => task.taskId))
  const ordered = [...new Set([...ids, ...byId.keys()])]
    .map(id => byId.get(id))
    .filter((task): task is T => task !== undefined)

  return Array.from({ length: count }, (_, index) => ordered[index] ?? null)
}
