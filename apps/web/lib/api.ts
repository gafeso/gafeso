// Client HTTP minimal vers l'API (proxifiée en same-origin sous /api).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    // Same-origin (/api/* proxifié vers l'API) : le cookie de session httpOnly
    // `bc_token` est renvoyé automatiquement — c'est le canal d'auth du
    // navigateur. `token` ne sert plus qu'aux éventuels clients Bearer.
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      // class-validator renvoie parfois un tableau de messages
      message = Array.isArray(body?.message)
        ? body.message.join(' · ')
        : (body?.message ?? message);
    } catch {
      /* corps non JSON : on garde statusText */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}
