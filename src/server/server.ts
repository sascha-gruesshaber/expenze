import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = isDev ? 3001 : (process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use('/api', routes);

if (!isDev) {
  const clientDist = path.join(__dirname, '..', '..', 'dist', 'client');
  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n  expenze running at http://localhost:${PORT}\n`);
});
