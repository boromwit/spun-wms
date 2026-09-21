# WMS คลังผ้าม้วน SPUN

เว็บแอปสแตติก (HTML/CSS/JS + Firebase Firestore) — host บน GitHub Pages ได้เลย ไม่มี build step

## ทดลองใช้
เปิด `index.html` ได้ทันที (หรือ `python -m http.server`) — ถ้ายังไม่ตั้งค่า Firebase จะรัน **โหมดทดลอง**
เก็บข้อมูลใน localStorage พร้อมข้อมูลตัวอย่าง

## ตั้งค่า Firestore
1. Firebase Console → สร้างโปรเจกต์ → Build → Firestore Database (production mode)
2. Project settings → Your apps → Web → คัดลอก config ใส่ `js/config.js` (`firebase: {...}`)
3. Firestore Rules — แอปไม่มี login จึงต้องเปิดอ่าน/เขียน (ใครรู้ URL + projectId ก็เขียนได้ ควรจำกัดด้วย
   App Check หรือ restrict API key ให้เฉพาะโดเมนที่ host):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /{col}/{doc} { allow read, write: if col in ['stock','slots','tx']; }
     }
   }
   ```
4. Push ขึ้น GitHub → Settings → Pages

## ปรับแต่ง (`js/config.js`)
- `zones` / `levelPref` — จำนวน Zone, Rack, ลำดับชั้นที่แนะนำ; `unit` — หน่วยจำนวน
- `abc` — เกณฑ์ ABC: จัด class ให้ "สี" จากยอดจ่ายออกย้อนหลัง 90 วัน (สะสม 80% = A, 95% = B, ที่เหลือ = C);
  ข้อมูลจ่ายออกน้อยกว่า `minTx` รายการ → ใช้ class B; สีใหม่ที่ยังไม่เคยจ่าย → C

## โครงข้อมูล
`stock/{id}` (รายการเก็บ + สถานะ stored/picked + รูป) · `slots/{ตำแหน่ง}` (มี doc = ช่องเต็ม ใช้กันบันทึกทับช่องเดียวกันผ่าน transaction) · `tx/{id}` (ประวัติ)
