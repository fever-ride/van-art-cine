import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import screenings from './routes/screenings.js';
import films from './routes/films.js';
import venues from './routes/venues.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/screenings', screenings);
app.use('/api/films', films);
app.use('/api/venues', venues);

// final error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API on :${port}`));