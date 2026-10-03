# NTP Audit

ระบบภายในสำหรับข้อมูลเงินเดือนพนักงาน นำเข้า Excel รายเดือน และรายงานรายปี

## เริ่มใช้งานในเครื่อง

```bash
npm install
docker compose up -d
cp .env.example .env.local
# ใส่ ADMIN_EMAIL, ADMIN_PASSWORD และเปลี่ยน SESSION_SECRET ใน .env.local
npm run db:setup
npm run dev
```

บน Windows PowerShell ใช้ `Copy-Item .env.example .env.local` แทน `cp` ได้ เปิด `http://localhost:3000/login` แล้วเข้าสู่ระบบด้วยบัญชีที่ตั้งใน `.env.local` หลังสร้างบัญชีแล้วสามารถลบ `ADMIN_PASSWORD` จากไฟล์นั้นได้

ระบบใช้ PostgreSQL ใน Docker ที่พอร์ต `127.0.0.1:5433` สำหรับพัฒนา หากใช้ Supabase ภายหลัง ให้เปลี่ยน `DATABASE_URL` เป็น PostgreSQL connection string ของโปรเจกต์ แล้วรัน `npm run db:setup` อีกครั้ง เก็บ `.env.local` ไว้เฉพาะเครื่องหรือ secret manager

## โครงสร้าง

- `src/app` — Next.js routes และระบบภาพ
- `src/components/workspace.tsx` — หน้าจอและการไหลของงาน
- `src/lib/data-context.tsx` — โหลดข้อมูลจริงจาก API และแปลงยอดรายเดือนเป็นข้อมูลหน้าจอ
- `db/schema.sql` — โครง PostgreSQL และ active import view
- `scripts/setup.mjs` — สร้างตาราง รายการเงินเดือนเริ่มต้น และบัญชี Admin
- `docs/product-plan.md` — แผน session, ระบบข้อมูล และเกณฑ์ตรวจ

ไฟล์ `.xlsx` และ `.env*` ถูกกันออกจาก Git เพื่อป้องกันการเผยแพร่ข้อมูลส่วนบุคคลและคีย์เชื่อมต่อ

## สถานะงาน

Session 1: หน้าจอ 17 เส้นทางและระบบภาพ

Session 2: PostgreSQL, Login แบบ session cookie, บทบาท, API ข้อมูลจริง, เพิ่มพนักงาน/วันลา/ปรับเงินเดือน และ audit log

Session ถัดไป: Excel importer, รายงานละเอียดแบบ dynamic, export และ PWA
