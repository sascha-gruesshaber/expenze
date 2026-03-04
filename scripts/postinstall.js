import { existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const templatePath = resolve(root, '.env.template');

if (!existsSync(envPath)) {
  copyFileSync(templatePath, envPath);
  console.log('Created .env from .env.template');
} else {
  console.log('.env already exists, skipping');
}
