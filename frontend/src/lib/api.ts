export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function readJson(res: Response) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const body = await readJson(res)
  if (!res.ok) throw new ApiError('GET_FAILED', res.status, body)
  return body as T
}

export async function apiPost<T>(path: string, data: unknown, csrfToken: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(data ?? {}),
  })
  const body = await readJson(res)
  if (!res.ok) throw new ApiError('POST_FAILED', res.status, body)
  return body as T
}

