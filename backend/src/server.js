import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 3000);

const allowed = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.listen(port, () => {
  console.log(`API on :${port}`);
  if (allowed.length) {
    console.log('CORS allowed origins:', allowed.join(', '));
  } else {
    console.log('CORS allowed origins: (permissive — set ALLOWED_ORIGIN in production)');
  }
});
