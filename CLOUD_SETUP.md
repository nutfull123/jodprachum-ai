# ตั้งค่าคลาวด์ Live 24 ชม. และที่เก็บไฟล์วิจัยบน Vercel (ฟรี 0 บาท · ไม่ต้องผูกบัตร)

ShootNote รองรับการทำงานร่วมกันผ่านคลาวด์ตลอด 24 ชม. และฝากไฟล์วิจัย (PDF, Word, Excel, PowerPoint, รูปภาพ, คลิปเสียง) ได้โดยเชื่อมต่อผ่าน Vercel Storage ดังนี้ครับ:

## 1. เปิดระบบห้อง Live ค้างบนคลาวด์ 24 ชม. (Upstash Redis)
1. เข้าไปที่โปรเจกต์ของเว็บบน **Vercel Dashboard**
2. ไปที่แท็บ **Storage** → กด **Create Database** / **Marketplace**
3. เลือก **Upstash Redis** (แพ็กเกจ Free 256 MB / ไม่หลับหลัง 7 วัน) แล้วกด **Connect Project**
4. Vercel จะเพิ่มตัวแปร `UPSTASH_REDIS_REST_URL` และ `UPSTASH_REDIS_REST_TOKEN` ให้อัตโนมัติ (หรือ `KV_REST_API_URL` / `KV_REST_API_TOKEN`)

## 2. เปิดระบบฝากไฟล์วิจัยขึ้นคลาวด์ (Vercel Blob 1 GB)
1. ในแท็บ **Storage** ของโปรเจกต์เดียวกัน กด **Create Database**
2. เลือก **Blob** (แพ็กเกจ Free 1 GB) แล้วกด **Connect Project**
3. Vercel จะเพิ่มตัวแปร `BLOB_READ_WRITE_TOKEN` ให้อัตโนมัติ

## 3. สั่ง Redeploy 1 ครั้ง
- ไปที่แท็บ **Deployments** → กดปุ่ม `...` บน Deployment ล่าสุด → กด **Redeploy**
- หลัง Deploy เสร็จ หน้าต่าง **"แชร์ทำร่วมกัน"** จะขึ้นสถานะ **"คลาวด์ 24 ชม. พร้อมใช้งาน"** (และตั้ง **รหัส PIN ล็อกห้อง** ได้ทันที) พร้อมอัปโหลดไฟล์เอกสารเข้าห้องแชร์ให้เพื่อนเปิดดู/ดาวน์โหลดได้ตลอดเวลา!
