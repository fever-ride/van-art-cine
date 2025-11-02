import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import screenings from './routes/screenings.js';
import films from './routes/films.js';
import auth from './routes/auth.js';
import watchlist from './routes/watchlist.js';
import cinemas from './routes/cinemas.js';

const app = express();

/* -------- Core setup -------- */

app.set('trust proxy', 1);

// Parse cookies before anything that relies on them
app.use(cookieParser());

// CORS
const allowed = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server / curl (no Origin header)
    if (!origin) return cb(null, true);

    if (allowed.length > 0) {
      return allowed.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS: origin not allowed'));
    }

    // If not configured, be permissive in dev
    return cb(null, true);
  },
  credentials: true, // send/set cookies
}));

// Body parsing & logging
app.use(express.json());
app.use(morgan('dev'));

/* -------- Health -------- */
app.get('/health', (_req, res) => res.json({ ok: true }));

/* -------- Rate limits -------- */
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,               // 10 attempts per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

/* -------- Routes -------- */
app.use('/api/auth', auth); 
app.use('/api/screenings', screenings);
app.use('/api/films', films);
app.use('/api/watchlist', watchlist);
app.use('/api/cinemas', cinemas);

/* -------- 404 -------- */
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204); // preflight safety
  next({ status: 404, message: 'Not Found' });
});

/* -------- Final error handler -------- */
app.use((err, _req, res, _next) => {
  // can add more structured logging here
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Server error';
  res.status(status).json({ error: message });
});

/* -------- Start server -------- */
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API on :${port}`);
  if (allowed.length) {
    console.log('CORS allowed origins:', allowed.join(', '));
  } else {
    console.log('CORS allowed origins: (permissive/dev)');
  }
});