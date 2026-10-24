import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';

/** Parse and validate a JSON body with zod. Responds 400 with a plain-language message on failure. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'The request body must be JSON.' });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw new HTTPException(400, { message: `${where}${first?.message ?? 'Invalid input'}` });
  }
  return parsed.data;
}

/** Validate route params / query values. */
export function parseParam<S extends z.ZodType>(schema: S, value: unknown, label: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HTTPException(400, { message: `Invalid ${label}` });
  return parsed.data;
}

export function notFound(what: string): never {
  throw new HTTPException(404, { message: `${what} not found` });
}
