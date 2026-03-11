# expenze

A self-hosted personal finance app for importing, categorizing, and analyzing bank transactions. Built for German banks with support for CSV, MT940, CAMT.052, and PDF formats.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Express](https://img.shields.io/badge/Express-5-000)
![SQLite](https://img.shields.io/badge/SQLite-Prisma-2D3748)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### Transaction Import
- **Multi-format support**: CSV, MT940 (SWIFT), CAMT.052 (ISO 20022 XML), **PDF** (AI-powered)
- **Preview-before-import flow** with duplicate detection
- **AI-powered template generation** for unknown CSV formats
- **Auto-detection** of file format and bank
- **Custom templates** — create your own CSV column mappings via UI or AI
- **Duplicate detection** with configurable hash fields
- **Background processing** with import status tracking

### Categorization
- Default categories for common expense/income types (groceries, insurance, subscriptions, etc.)
- Custom categories per user
- **Rule-based auto-categorization** with regex/keyword matching and priority ordering
- **AI-powered suggestions** for uncategorized transactions (via OpenRouter)
- Batch recategorization from the transaction list

### Analytics & Dashboard
- Income/expense summary with period comparison
- Savings tracking
- Monthly trends and category breakdowns (pie charts, bar charts)
- **Advanced visualizations**: Sankey diagram, spending treemap, stacked area chart, calendar heatmap
- AI-generated spending insights

### Account Groups
- Organize bank accounts into logical groups (e.g. "Girokonten", "Sparkonten")
- Group-level analysis — filter all analytics and chat queries by group
- Cascading properties (account type, active status) from group to member accounts

### AI Chat
- Ask questions about your finances in natural language
- Streaming responses (SSE) with tool-calling (queries transactions, analyzes categories, summarizes stats)
- Multiple LLM providers via OpenRouter (Gemini, Claude, DeepSeek, Qwen, etc.)
- Model browser with pricing and context length info
- Per-user API keys configured in settings

### Multi-User & Auth
- Passwordless authentication (magic links + passkeys/WebAuthn)
- Full data isolation between users
- Per-user categories, rules, templates, and settings
- Per-user OpenRouter API keys (stored in settings, not env)

### Other
- German-localized UI
- Responsive design (dark/light theme)
- Docker deployment with single-command setup
- SQLite — no external database needed

## Tech Stack

| Layer     | Technology                                        |
|-----------|---------------------------------------------------|
| Frontend  | React 19, TanStack Router & Query, Tailwind CSS   |
| Backend   | Express 5, Node.js 20                             |
| Database  | SQLite via Prisma 7                                |
| Auth      | better-auth (magic link, passkeys)                 |
| AI        | OpenRouter API, TanStack AI                        |
| Charts    | Chart.js, Nivo (Sankey, Treemap, Calendar), pdfjs-dist |
| Build     | Vite 6, TypeScript 5.7                             |
| Deploy    | Docker / Docker Compose                            |

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/sascha-gruesshaber/expenze.git
cd expenze
npm install
```

Create a `.env` file:

```env
DATABASE_URL="file:../data/banking.db"
BETTER_AUTH_SECRET="your-secret-at-least-32-characters-long"
BETTER_AUTH_URL="http://localhost:3000"

# Optional: Email (magic links logged to console if omitted)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=password
SMTP_FROM=noreply@example.com
```

AI features (chat, categorization, PDF import) require an OpenRouter API key — configure it per-user in Settings after login.

### Development

```bash
npm run dev           # Vite (5173) + Express (3001)
```

Magic links are printed to the console — no SMTP required for local development.

### Production

```bash
npm run build
npm run start         # Serves everything on port 3000
```

### Docker

```bash
docker-compose up
```

Exposes port 3000 with a persistent volume for the SQLite database.

### Database

```bash
npm run db:push       # Apply schema changes
npm run db:generate   # Regenerate Prisma client
```

## Project Structure

```
src/
├── client/              # React frontend
│   ├── components/      # UI components
│   │   └── BankLogo.tsx # Bank logo resolver
│   ├── lib/             # Auth client, API helpers
│   │   └── sidebarContext.tsx
│   └── routes/          # TanStack file-based routes
│       ├── _app/        # Authenticated app routes
│       │   ├── dashboard.tsx
│       │   ├── import.tsx
│       │   ├── transactions.tsx
│       │   ├── categories.tsx
│       │   ├── analytics.tsx
│       │   ├── templates.tsx
│       │   ├── accounts.tsx
│       │   ├── settings.tsx
│       │   └── chat.tsx
│       └── login.tsx
├── server/
│   ├── server.ts        # Express entry point
│   ├── routes.ts        # API routes
│   ├── auth.ts          # better-auth config
│   ├── authMiddleware.ts
│   └── parsers/         # Bank statement parsers
│       ├── builtinTemplates.ts
│       ├── templateParser.ts
│       ├── mt940Parser.ts
│       ├── camt052Parser.ts
│       ├── pdfParser.ts
│       ├── csvUtils.ts
│       └── registry.ts
└── prisma/
    └── schema.prisma    # Database schema
```

## What expenze Does NOT Do

- **No bank API integration** — transactions are imported from files, not fetched automatically
- **No scheduled payments or bill reminders**
- **No export** to CSV, PDF, or other formats
- **No investment tracking or tax reporting**
- **No transaction splitting** (e.g., splitting a grocery receipt into food + household)
- **No mobile app** — web-only (responsive design works on mobile browsers)
- **No real-time sync** across devices (standard request/response)
- **Not designed for scale** — SQLite is great for personal use, not for thousands of concurrent users

## Environment Variables

| Variable                      | Required | Description                              |
|-------------------------------|----------|------------------------------------------|
| `DATABASE_URL`                | Yes      | SQLite file path                         |
| `BETTER_AUTH_SECRET`          | Yes      | Auth secret (32+ chars)                  |
| `BETTER_AUTH_URL`             | Yes      | App URL for auth callbacks               |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No       | Comma-separated CORS origins             |
| `SMTP_HOST`                   | No       | SMTP server for magic link emails        |
| `SMTP_PORT`                   | No       | SMTP port                                |
| `SMTP_USER`                   | No       | SMTP username                            |
| `SMTP_PASS`                   | No       | SMTP password                            |
| `SMTP_FROM`                   | No       | Sender email address                     |

## License

[MIT](LICENSE)
