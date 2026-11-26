import type { Field } from './people.ts'

export type FieldErrors = Partial<Record<Field, string>>

export class ApiError extends Error {
  fields: FieldErrors

  constructor(data: { message: string; fields?: FieldErrors }) {
    super(data.message)
    this.fields = data.fields ?? {}
  }
}

export async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(path, {
    method,
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const data = await response.json()
  if (!response.ok) throw new ApiError(data)
  return data as T
}
