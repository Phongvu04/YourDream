/**
 * Script tạo tài khoản Admin lần đầu tiên.
 * Chạy bằng: node Backend/createAdmin.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const User = require('./models/User');

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Kiểm tra nếu admin đã tồn tại
        const existing = await User.findOne({ isAdmin: true });
        if (existing) {
            console.log('⚠️  Tài khoản Admin đã tồn tại!');
            console.log('   Email   :', existing.email);
            console.log('   Đăng nhập tại: http://localhost:3000/admin');
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        await User.create({
            id: 'admin_' + Date.now(),
            name: 'Admin',
            email: 'admin@gmail.com',
            password: hashedPassword,
            isAdmin: true,
            trustScore: 100,
            abandonCount: 0,
            createdAt: new Date().toISOString(),
        });

        console.log('\n✅ Tạo tài khoản Admin thành công!');
        console.log('═══════════════════════════════════');
        console.log('   Email   : admin@gmail.com');
        console.log('   Mật khẩu: 123456');
        console.log('   URL     : http://localhost:3000/admin');
        console.log('═══════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Lỗi khi tạo Admin:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

createAdmin();
