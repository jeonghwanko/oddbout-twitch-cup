/** Trusted definitions fail at load time; player saves use their forgiving codecs instead. */
export function definitionError(path: string, message: string): never {
  throw new Error(`Quest definition ${path}: ${message}`);
}

export function definitionObject(value: unknown, path: string, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return definitionError(path, "expected object");
  const record = value as Record<string, unknown>;
  if (keys) for (const key of Object.keys(record)) {
    if (!keys.includes(key)) definitionError(`${path}.${key}`, "unknown field");
  }
  return record;
}

export function definitionArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return definitionError(path, "expected array");
  return value;
}

export function definitionText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) return definitionError(path, "expected non-empty string");
  return value;
}

export function definitionRef<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) return definitionError(path, `unknown reference ${String(value)}`);
  return value as T;
}

export function definitionNumber(value: unknown, path: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) return definitionError(path, "expected finite number in range");
  return value;
}

/** Order is also the linear prerequisite graph. Missing, duplicate and cyclic/backward edges fail. */
export function definitionOrder(value: unknown, ids: readonly string[], path: string): string[] {
  for (const id of ids) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || id === "constructor" || id === "prototype") definitionError(path, `invalid stable ID ${id}`);
  }
  const order = definitionArray(value, path).map((id, i) => definitionRef(id, ids, `${path}[${i}]`));
  if (order.length === 0 || new Set(order).size !== order.length || order.length !== ids.length) definitionError(path, "must contain each ID exactly once");
  return order;
}

export function freezeDefinition<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDefinition(child);
    Object.freeze(value);
  }
  return value;
}
