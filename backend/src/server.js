import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { prisma } from './lib/prismaClient.js';
import { AuthError } from './utils/errors.js';
import screenings from './routes/screenings.js';
import films from './routes/films.js';
import auth from './routes/auth.js';
import watchlist from './routes/watchlist.js';
import cinemas from './routes/cinemas.js';
import user from './routes/user.js';

const app = express();

/* -------- Core setup -------- */

// Trust first proxy (e.g. Nginx, load balancer) so X-Forwarded-* and rate-limit IP are correct.
app.set('trust proxy', 1);

// Cookie parsing must run before any middleware or routes that read req.cookies (e.g. auth).
app.use(cookieParser());

/**
 * CORS (Cross-Origin Resource Sharing)
 *
 * - ALLOWED_ORIGIN: Comma-separated list of origins (e.g. "https://app.example.com,https://admin.example.com").
 *   When set, only these origins may make credentialed cross-origin requests.
 * - When ALLOWED_ORIGIN is unset or empty: allow any origin (convenient for local dev; avoid in production).
 * - Requests with no Origin header (same-origin, curl, server-to-server) are always allowed.
 * - credentials: true is required so the browser sends cookies (e.g. access_token) on cross-origin requests.
 */
const allowed = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);

    if (allowed.length > 0) {
      return allowed.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS: origin not allowed'));
    }

    return cb(null, true);
  },
  credentials: true,
}));

// JSON body parsing and request logging (after CORS so logs reflect actual client).
app.use(express.json());
app.use(morgan('dev'));

/* -------- Health & readiness -------- */
// healthz: liveness only. readyz: includes DB check; returns 503 if DB unreachable.
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/readyz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    console.error('Readiness check DB error:', err?.message);
    res.status(503).json({ ok: false, db: 'error' });
  }
});

/* -------- Rate limiting (auth endpoints; separate counters per path) -------- */
const RATE_LIMIT_MESSAGE = 'Too many requests. Please try again in a moment.';

function createAuthEndpointLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'RATE_LIMIT',
        message: RATE_LIMIT_MESSAGE,
      });
    },
  });
}

app.use('/api/auth/login', createAuthEndpointLimiter());
app.use('/api/auth/register', createAuthEndpointLimiter());

/* -------- API routes -------- */
app.use('/api/auth', auth); 
app.use('/api/screenings', screenings);
app.use('/api/films', films);
app.use('/api/watchlist', watchlist);
app.use('/api/cinemas', cinemas);
app.use('/api/user', user);

/* -------- 404 and preflight -------- */
// Unmatched routes: respond 204 to OPTIONS (CORS preflight); otherwise 404.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next({ status: 404, message: 'Not Found' });
});

/* -------- Global error handler -------- */
// Normalizes all errors to { error, message, details? } and sets status (default 500).
app.use((err, _req, res, _next) => {
  // Expected anonymous access to requireAuth routes: avoid noisy stack traces in dev logs.
  const quietAuth =
    err instanceof AuthError &&
    err.status === 401 &&
    (err.code === 'NO_ACCESS_TOKEN' || err.code === 'BAD_ACCESS_TOKEN');
  if (quietAuth) {
    if (process.env.AUTH_DEBUG === '1') {
      console.error(err);
    }
  } else {
    console.error(err);
  }

  const status = err.status || 500;

  const code =
    err.code ||
    err.error ||
    'SERVER_ERROR';

  const isKnownError = err.status != null;
  const message = isKnownError
    ? err.message
    : (process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Server error');

  res.status(status).json({
    error: code,
    message,
    details: err.details || undefined,
  });
});

/* -------- Start server -------- */
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API on :${port}`);
  if (allowed.length) {
    console.log('CORS allowed origins:', allowed.join(', '));
  } else {
    console.log('CORS allowed origins: (permissive — set ALLOWED_ORIGIN in production)');
  }
});