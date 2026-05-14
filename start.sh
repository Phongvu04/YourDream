#!/bin/bash

echo "================================================"
echo "         GoalFlow - Khởi động ứng dụng"
echo "================================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[1/3] Cài đặt dependencies..."
    npm install
    echo ""
else
    echo "[1/3] Dependencies đã được cài đặt"
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "[2/3] Cấu hình .env..."
    echo "WARNING: File .env chưa tồn tại!"
    echo "Vui lòng:"
    echo "  1. Copy file .env.example thành .env"
    echo "  2. Điền thông tin API keys vào file .env"
    echo "  3. Chạy lại script này"
    echo ""
    exit 1
else
    echo "[2/3] File .env đã tồn tại"
    echo ""
fi

echo "[3/3] Khởi động server..."
echo ""
echo "Server sẽ chạy tại: http://localhost:3000"
echo "Nhấn Ctrl+C để dừng server"
echo ""
echo "================================================"
echo ""

node server.js
