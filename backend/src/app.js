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
import search from './routes/search.js';

const app = express();

app.set('trust proxy', 1);
app.use(cookieParser());

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

app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

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

app.use('/api/auth', auth);
app.use('/api/screenings', screenings);
app.use('/api/films', films);
app.use('/api/watchlist', watchlist);
app.use('/api/cinemas', cinemas);
app.use('/api/user', user);
app.use('/api/search', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'RATE_LIMIT', message: RATE_LIMIT_MESSAGE });
  },
}), search);

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next({ status: 404, message: 'Not Found' });
});

app.use((err, _req, res, _next) => {
  const quietAuth =
    err instanceof AuthError &&
    err.status === 401 &&
    (err.code === 'NO_ACCESS_TOKEN' || err.code === 'BAD_ACCESS_TOKEN');
  if (quietAuth) {
    if (process.env.AUTH_DEBUG === '1') {
      console.error(err);
    }
  } else if (process.env.NODE_ENV !== 'test') {
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

export default app;
