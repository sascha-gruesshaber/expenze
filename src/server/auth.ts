import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { prisma } from './prisma.js';
import nodemailer from 'nodemailer';

const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(s => s.trim())
  : [];

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'sqlite' }),
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (transporter) {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@expenze.local',
            to: email,
            subject: 'Dein Login-Link für expenze',
            html: `<p>Klicke <a href="${url}">hier</a> um dich bei expenze einzuloggen.</p><p>Oder kopiere diesen Link: ${url}</p>`,
          });
          console.log(`  Magic link sent to ${email}`);
        } else {
          console.log(`\n  Magic Link for ${email}:\n  ${url}\n`);
        }
      },
    }),
    passkey({
      rpName: 'expenze',
    }),
  ],
});
