# NTP Audit

Internal payroll platform for importing monthly Excel files, managing employee payroll data, and generating annual reports automatically.

<p>
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Excel-XLSX-217346?style=flat-square&logo=microsoftexcel&logoColor=white" />
</p>

## Features

- Monthly Excel payroll import
- Employee payroll management
- Monthly and annual payroll reports
- Leave and salary adjustment tracking
- Original Excel file storage
- Annual Excel report generation
- Historical payroll data by year

## Tech Stack

**Frontend**
- Next.js
- TypeScript
- Tailwind CSS

**Backend**
- Next.js Server
- Node.js

**Database & Storage**
- PostgreSQL
- Supabase
- Supabase Storage

**Development**
- Docker
- npm

## Workflow

```mermaid
flowchart TD
    A["User / Accounting"]
    B["Next.js Web App"]
    C["Application Layer"]
    D[("PostgreSQL / Supabase DB")]
    E["Supabase Storage"]

    A --> B
    B --> C
    C --> D
    C --> E
