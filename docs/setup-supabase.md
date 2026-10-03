# เตรียม Supabase สำหรับ NTP Audit

โค้ดพร้อมใช้ PostgreSQL ของ Supabase ผ่าน `DATABASE_URL` แต่ยังไม่มีโปรเจกต์ของบริษัท จึงยังไม่ได้ทดสอบการเชื่อมต่อจริงกับ Supabase คู่มือนี้ใช้เมื่อสร้างโปรเจกต์แล้ว โดยไม่ต้องส่งรหัสผ่านหรือคีย์ในแชต

1. สร้าง Supabase project ในพื้นที่ที่บริษัทอนุมัติ และเก็บรหัสผ่านฐานข้อมูลในตัวจัดการ secret ของบริษัท
2. เปิดหน้า **Connect** ของโปรเจกต์ คัดลอก PostgreSQL connection string แบบ direct หรือ session pooler ที่เข้ากับสภาพแวดล้อมรันแอป ใช้ TLS ตามค่าใน connection string ที่ Supabase ให้
3. ตั้งค่า `.env.local` บนเครื่องรันแอป: `DATABASE_URL` เป็น connection string นั้น, `SESSION_SECRET` เป็นค่าสุ่มอย่างน้อย 32 ตัวอักษร, `ADMIN_EMAIL`, `ADMIN_PASSWORD` และ `COMPANY_NAME` สำหรับสร้างบัญชีครั้งแรก ห้าม commit `.env.local`
4. รัน `npm install` และ `npm run db:setup` เพื่อสร้างตาราง รายการจ่ายเริ่มต้น และบัญชี admin แล้วลบ `ADMIN_PASSWORD` ออกจากไฟล์ตั้งค่าเมื่อสร้างสำเร็จ รัน `npm run dev` สำหรับทดสอบหรือ `npm run build` และ `npm start` สำหรับเซิร์ฟเวอร์จริง
5. ทดสอบ Login, นำเข้าไฟล์ตัวอย่างในสภาพแวดล้อมทดสอบ, ตรวจยอดและส่งออก ก่อนนำเข้าข้อมูลจริง สำรองฐานข้อมูลและไฟล์ต้นฉบับพร้อมกัน

ไฟล์ Excel ต้นฉบับเก็บใน `PRIVATE_UPLOAD_DIR` บนเครื่องเซิร์ฟเวอร์ ไม่ได้เก็บใน Supabase Storage ในเวอร์ชันนี้ โฮสต์ที่ใช้ต้องมีพื้นที่ไฟล์ถาวรและสำรองได้ ห้ามใช้พื้นที่ไฟล์ชั่วคราวของ serverless สำหรับไฟล์จริง หากย้ายไปใช้ Supabase Storage ภายหลัง ต้องสร้าง private bucket และเปลี่ยน storage adapter ก่อนย้ายโฮสต์

ระบบ Login ใช้ตาราง `users` และ session cookie ภายในแอป ยังไม่ใช้ Supabase Auth ดังนั้นการเชื่อมฐานข้อมูล Supabase ไม่ได้สร้างบัญชีผู้ใช้ใน Supabase Auth โดยอัตโนมัติ
