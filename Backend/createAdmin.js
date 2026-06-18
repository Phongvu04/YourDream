/**
 * Script tạo tài khoản Admin lần đầu tiên.
 * Chạy bằng: node Backend/createAdmin.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const User = require('./models/User');

async function createAdmin() {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Trường hợp 1: Đã có tài khoản isAdmin = true rồi
        const existingAdmin = await User.findOne({ isAdmin: true });
        if (existingAdmin) {
            console.log('⚠️  Tài khoản Admin đã tồn tại!');
            console.log('   Email   :', existingAdmin.email);
            console.log('   Đăng nhập tại: /admin');
            process.exit(0);
        }

        // Trường hợp 2: Email admin đã đăng ký bình thường nhưng chưa có quyền
        const existingUser = await User.findOne({ email: ADMIN_EMAIL });
        if (existingUser) {
            console.log(`⚠️  Tìm thấy tài khoản "${ADMIN_EMAIL}" nhưng chưa có quyền Admin.`);
            console.log('   → Đang cấp quyền Admin cho tài khoản này...');

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

            await User.findOneAndUpdate(
                { email: ADMIN_EMAIL },
                { $set: { isAdmin: true, password: hashedPassword } }
            );

            console.log('\n✅ Đã cấp quyền Admin thành công!');
            console.log('═══════════════════════════════════');
            console.log('   Email   :', ADMIN_EMAIL);
            console.log('   Mật khẩu:', ADMIN_PASSWORD, '(đã đặt lại)');
            console.log('   URL     : /admin');
            console.log('═══════════════════════════════════\n');
            process.exit(0);
        }

        // Trường hợp 3: Chưa có gì → tạo mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

        await User.create({
            id: 'admin_' + Date.now(),
            name: 'Admin',
            email: ADMIN_EMAIL,
            password: hashedPassword,
            isAdmin: true,
            trustScore: 100,
            abandonCount: 0,
            createdAt: new Date().toISOString(),
        });

        console.log('\n✅ Tạo tài khoản Admin thành công!');
        console.log('═══════════════════════════════════');
        console.log('   Email   :', ADMIN_EMAIL);
        console.log('   Mật khẩu:', ADMIN_PASSWORD);
        console.log('   URL     : /admin');
        console.log('═══════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Lỗi khi tạo Admin:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

createAdmin();
