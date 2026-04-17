# ใช้ Python 3.12 รุ่นเบา
FROM python:3.12-slim

# สร้าง User เฉพาะสำหรับ Hugging Face (บังคับ)
RUN useradd -m -u 1000 user

# กำหนดพื้นที่ทำงาน
WORKDIR /app

# ก๊อปปี้และติดตั้ง requirements (ไม่ต้องใช้ apt-get แล้ว)
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ก๊อปปี้ไฟล์ทั้งหมดของแอปเรา และมอบสิทธิ์ให้ user
COPY --chown=user . /app

# สลับไปใช้ user ที่สร้าง
USER user

# แจ้งว่าใช้พอร์ต 7860
EXPOSE 7860

# คำสั่งเปิดเซิร์ฟเวอร์
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
