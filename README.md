# NTP Audit

Internal payroll platform for importing monthly Excel files, managing employee payroll data, and generating annual reports automatically.

<p>
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Excel-XLSX-217346?style=flat-square&logo=microsoftexcel&logoColor=white" />
</p>

## Features

- Monthly Excel payroll import
- Employee payroll management
- Monthly and annual payroll reports
- Leave and salary adjustment tracking
- Original Excel file storage
- Employee annual payroll tables
- Historical payroll data by year

## Tech Stack

**Current**

- Next.js, TypeScript, and project CSS/design tokens
- PostgreSQL with an optional Supabase PostgreSQL target and private Supabase Storage for original Excel workbooks
- Docker and npm for local development

**Future plan**

- Tailwind CSS if the team decides to migrate the current CSS system

## Workflow

```mermaid
flowchart TD
    A["User / Accounting"] --> B["Next.js Web App"]
    B --> C["Parse and validate Excel"]
    C --> D[("PostgreSQL")]
    C --> E["Private file storage"]
    D --> F["Monthly and annual payroll reports"]
```

## Run locally

```bash
npm install
docker compose up -d
cp .env.example .env.local
# Set ADMIN_EMAIL, ADMIN_PASSWORD, and a random SESSION_SECRET in .env.local
npm run db:setup
npm run dev
```


