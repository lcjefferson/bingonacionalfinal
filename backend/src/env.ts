import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3005),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  /** Use the public site URL (ex.: https://bingo.exemplo.com). Must match the browser origin for cookies + Socket.IO. */
  CORS_ORIGIN: z.string().min(1).default('http://127.0.0.1:5174'),
  /**
   * Set to `1` or `true` when the app runs behind Nginx/Traefik/ALB (TLS termination).
   * Enables Express `trust proxy` and session cookies that respect `X-Forwarded-Proto`.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true' || v === 'yes'),
})

export type Env = z.infer<typeof EnvSchema>

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables')
  }
  return parsed.data
}

