const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Force IPv4 DNS - fix ENETUNREACH trên Render

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
// Load .env nếu có (local dev). Trên Render, env vars được inject qua OS nên không cần file .env
const dotenvPath = require('path').resolve(__dirname, '../.env');
if (require('fs').existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
} else {
    require('dotenv').config(); // fallback: tìm .env từ cwd
}

const User = require('./models/User');
const Goal = require('./models/Goal');
const ChatSession = require('./models/ChatSession');
const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/auth-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1); // Render dùng reverse proxy
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting — giới hạn request chống spam
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100,                 // tối đa 100 request / 15 phút
    message: { success: false, error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,                  // tối đa 20 lần đăng nhập / 15 phút
    message: { success: false, error: 'Quá nhiều lần đăng nhập, vui lòng thử lại sau 15 phút.' }
});
app.use('/api/ai/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Data paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GOALS_FILE = path.join(DATA_DIR, 'goals.json');

// Khởi tạo và kết nối cơ sở dữ liệu MongoDB
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Xóa những User cũ không có password để tránh lỗi hệ thống jwt
        try {
            const deleted = await User.deleteMany({ password: { $exists: false } });
            if (deleted.deletedCount > 0) {
                console.log(`🗑️ Đã xóa ${deleted.deletedCount} tài khoản hệ thống cũ (không có mật khẩu)`);
            }
        } catch (e) { console.error('Lỗi khi clean up DB:', e); }

        // Tự động tạo/cấp quyền tài khoản Admin nếu chưa có
        await ensureAdminExists();

    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error);
        process.exit(1); // Dừng server nếu không kết nối được DB
    }
}

// Đảm bảo luôn có tài khoản Admin trong DB (RBAC)
async function ensureAdminExists() {
    try {
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

        // Kiểm tra theo cả 2 cách: role mới và isAdmin cũ
        const existingAdmin = await User.findOne({
            $or: [{ role: 'admin' }, { isAdmin: true }]
        });
        if (existingAdmin) {
            // Đảm bảo tài khoản admin cũ cũng có trường role mới
            if (existingAdmin.role !== 'admin') {
                await User.findOneAndUpdate(
                    { _id: existingAdmin._id },
                    { $set: { role: 'admin' } }
                );
                console.log(`👑 Đã cập nhật role='admin' cho: ${existingAdmin.email}`);
            } else {
                console.log(`👑 Admin đã tồn tại: ${existingAdmin.email} (role: admin)`);
            }
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

        // Email đó đã đăng ký bình thường → cấp quyền + đặt lại mật khẩu
        const existingUser = await User.findOne({ email: ADMIN_EMAIL });
        if (existingUser) {
            await User.findOneAndUpdate(
                { email: ADMIN_EMAIL },
                // Cập nhật cả role (mới) lẫn isAdmin (cũ) để backward-compatible
                { $set: { role: 'admin', isAdmin: true, password: hashedPassword } }
            );
            console.log(`👑 Đã cấp quyền Admin cho tài khoản: ${ADMIN_EMAIL}`);
            return;
        }

        // Chưa có gì → tạo mới với cả 2 field
        await User.create({
            id: 'admin_' + Date.now(),
            name: 'Admin',
            email: ADMIN_EMAIL,
            password: hashedPassword,
            role: 'admin',   // ← RBAC field mới
            isAdmin: true,      // ← giữ lại để backward-compatible
            trustScore: 100,
            abandonCount: 0,
            createdAt: new Date().toISOString(),
        });
        console.log(`👑 Đã tạo tài khoản Admin mới: ${ADMIN_EMAIL}`);
    } catch (e) {
        console.error('⚠️ Lỗi khi khởi tạo Admin (server vẫn tiếp tục):', e.message);
    }
}

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail', // Dùng luôn template có sẵn của Nodemailer thay vì tự định nghĩa host/port
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Vẫn phải là Mật khẩu ứng dụng 16 ký tự nhé
    },
    tls: {
        rejectUnauthorized: false // Bỏ qua lỗi chứng chỉ khắt khe trên cloud
    },
    // Bơm thêm máu (thời gian chờ) cho Render vì mạng cloud đôi khi bị trễ
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
});

// Log để debug
transporter.verify((err) => {
    if (err) console.error('❌ SMTP verify failed:', err.message);
    else console.log('✅ SMTP ready: Gmail');
});

async function sendWelcomeEmail(toEmail, userName) {
    const mailOptions = {
        from: '"GoalFlow Team" <' + process.env.EMAIL_USER + '>',
        to: toEmail,
        subject: 'Chao mung ban den voi GoalFlow',
        text: 'Chao ban,\n\nCam on ban da tin tuong va su dung website GoalFlow de quan ly muc tieu ca nhan cua minh. Chung toi tao ra nen tang nay voi mong muon giup ban bien nhung ke hoach tren giay thanh hanh dong thuc te moi ngay.\n\nNeu ban co bat ky gop y hoac can ho tro, hay phan hoi lai email nay. Doi ngu cua chung toi luon san sang dong hanh cung ban tren hanh trinh chinh phuc muc tieu.\n\nChuc ban mot ngay lam viec hieu qua va day dong luc!\n\nTran trong.'
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Welcome email sent to ' + toEmail);
    } catch (error) {
        console.error('Error sending email to ' + toEmail + ':', error.message);
    }
}

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !email.toLowerCase().endsWith('@gmail.com')) {
            return res.status(400).json({ success: false, error: 'Chi chap nhan dia chi @gmail.com' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Mat khau phai tu 6 ky tu tro len' });
        }

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, error: 'Email da duoc dang ky' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = await User.create({
            id: Date.now().toString(),
            name,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        });

        // Gui email chao mung chay ngam
        sendWelcomeEmail(email, name).catch(console.error);

        res.json({ success: true, message: 'Dang ky thanh cong. Vui long dang nhap.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, error: 'Tài khoản không tồn tại' });
        if (user.isBanned) return res.status(403).json({ success: false, error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, error: 'Mật khẩu không chính xác' });
        const userRole = user.role || (user.isAdmin ? 'admin' : 'user');
        const token = jwt.sign({ id: user.id, email: user.email, role: userRole }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: userRole } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/users/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.id }).select('-password');
        if (!user) return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Vui lòng cung cấp email' });
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, error: 'Email không tồn tại trong hệ thống' });
        const newPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        const mailOptions = {
            from: `"GoalFlow Team" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Khôi phục mật khẩu GoalFlow',
            text: `Chào ${user.name},\n\nMật khẩu mới của bạn là: ${newPassword}\n\nTrân trọng,\nĐội ngũ GoalFlow`
        };
        transporter.sendMail(mailOptions).catch(console.error);
        res.json({ success: true, message: 'Mật khẩu mới đã được gửi vào email của bạn. Vui lòng kiểm tra hộp thư.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) return res.status(400).json({ success: false, error: 'Vui lòng cung cấp đầy đủ mật khẩu' });
        if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Mật khẩu mới phải từ 6 ký tự trở lên' });
        const user = await User.findOne({ id: req.user.id });
        if (!user) return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng' });
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ success: false, error: 'Mật khẩu hiện tại không chính xác' });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- GOAL ROUTES ---
app.post('/api/goals', authMiddleware, async (req, res) => {
    try {
        const { goals } = req.body;
        const userId = req.user.id;
        if (!goals || goals.length === 0) {
            await Goal.deleteMany({ userId });
            return res.json({ success: true, saved: 0 });
        }
        const VALID_STATUSES = ['active', 'checking', 'completed', 'abandoned'];
        const sanitized = goals.map(g => ({
            ...g, userId,
            status: VALID_STATUSES.includes(g.status) ? g.status : 'active',
            milestones: Array.isArray(g.milestones) ? g.milestones.map(m => ({ task: m.task || 'Milestone', isDone: Boolean(m.isDone), proof: m.proof || '' })) : [],
        }));
        const ops = sanitized.map(g => ({ updateOne: { filter: { id: g.id, userId }, update: { $set: g }, upsert: true } }));
        const result = await Goal.bulkWrite(ops, { ordered: false });
        const frontendIds = sanitized.map(g => g.id);
        await Goal.deleteMany({ userId, id: { $nin: frontendIds } });
        res.json({ success: true, saved: result.upsertedCount + result.modifiedCount });
    } catch (e) {
        console.error('❌ [Goals POST] Lỗi:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/goals', authMiddleware, async (req, res) => {
    try {
        const goals = await Goal.find({ userId: req.user.id });
        res.json({ success: true, goals });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});


// --- AI INTEGRATION (Google Gemini) ---
// Model fallback list - thu lan luot den khi thanh cong
const GEMINI_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-001',
];

/**
 * Goi Gemini API voi messages theo dinh dang OpenAI-compatible.
 * messages: [{ role: 'system'|'user'|'assistant', content: string }]
 * jsonMode: neu true, yeu cau AI tra ve JSON thuan tuy.
 */
async function callGeminiAPI(messages, jsonMode = false) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thieu GEMINI_API_KEY trong .env');

    // Chuyen dinh dang OpenAI -> Gemini
    // System prompt -> systemInstruction
    // user/assistant -> contents[]
    let systemInstruction = null;
    const contents = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            systemInstruction = { parts: [{ text: msg.content }] };
        } else {
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }
    }

    // Dam bao contents khong rong
    if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const requestBody = {
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {})
        }
    };
    if (systemInstruction) requestBody.systemInstruction = systemInstruction;

    let lastError = null;

    for (const model of GEMINI_MODELS) {
        try {
            const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                const errMsg = (data.error && data.error.message) ? data.error.message : ('HTTP ' + response.status);
                const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429') || errMsg.includes('limit');
                const isModel = errMsg.includes('not found') || errMsg.includes('not supported');

                if (isQuota || isModel) {
                    console.warn('[Gemini] Model "' + model + '" loi: ' + errMsg.substring(0, 100) + ' -> thu model tiep...');
                    lastError = new Error(errMsg);
                    continue;
                }
                throw new Error(errMsg);
            }

            if (!data.candidates || !data.candidates[0]) {
                throw new Error('Gemini khong tra ve ket qua. Co the bi chan boi safety filter.');
            }

            const text = data.candidates[0].content.parts[0].text || '';
            console.log('[Gemini] Su dung model: ' + model + ' (' + text.length + ' chars)');

            // Neu jsonMode: cat bo markdown code block neu co
            if (jsonMode) {
                // Gemini JSON mode already returns pure JSON - no need to strip
                const cleaned = text.trim();
                return cleaned || text;
            }

            return text;

        } catch (err) {
            const isRetryable = err.message && (
                err.message.includes('quota') ||
                err.message.includes('RESOURCE_EXHAUSTED') ||
                err.message.includes('not found') ||
                err.message.includes('fetch') ||
                err.message.includes('network') ||
                err.message.includes('ECONNREFUSED')
            );
            if (isRetryable) {
                console.warn('[Gemini] Loi voi "' + model + '": ' + err.message.substring(0, 100));
                lastError = err;
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('Tat ca Gemini model deu het quota hoac khong kha dung. Vui long kiem tra https://ai.dev/rate-limit');
}

// Alias de khong phai doi ten tat ca call sites
const callGroqAPI = callGeminiAPI;


// 1. Chat API
app.post('/api/ai/chat', authMiddleware, async (req, res) => {
    try {
        const { message, history, sessionId } = req.body;
        const userId = req.user.id;

        // Chỉ lấy 10 tin nhắn gần nhất
        const recentHistory = history.slice(-10).map(msg => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content
        }));

        const today = new Date();
        const currentDateStr = today.toISOString().split('T')[0];

        const systemPrompt = {
            role: "system",
            content: `Bạn là chuyên gia AI đồng hành quản trị hiệu suất cá nhân, tích hợp trong hệ thống GoalFlow. Hôm nay là ngày ${currentDateStr}.

NHIỆM VỤ CHÍNH:
Khi người dùng nhập một mục tiêu lớn (ví dụ: "Học Node.js trong 1 tháng", "Giảm 3kg", "Tìm việc mới"), bạn phải phân tích và phân rã mục tiêu đó thành các hành động cụ thể (Sub-tasks/Milestones).

QUY TẮC PHẢN HỒI:
1. KHÔNG trả về lời mở đầu hay lời kết dài dòng.
2. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
3. Khi phân rã mục tiêu, trả về dưới dạng các gạch đầu dòng rõ ràng, mỗi dòng là một hành động có thể thực hiện được (Actionable task).
4. Mỗi mục tiêu lớn chia thành tối đa 5 đến 7 task nhỏ.
5. Mỗi task bắt đầu bằng ký hiệu "[ ] " để người dùng dễ dàng theo dõi.
6. Nếu câu hỏi của người dùng chưa rõ ràng hoặc chưa phải là mục tiêu cụ thể, hãy đặt câu hỏi ngắn gọn để làm rõ.
7. Sau danh sách task, có thể thêm 1 dòng ngắn gợi ý khung thời gian phù hợp nếu người dùng chưa đề cập.

VÍ DỤ PHẢN HỒI KHI NHẬN MỤC TIÊU:
[ ] Tìm hiểu cơ bản về Node.js và cách cài đặt môi trường NPM.
[ ] Xây dựng HTTP Server đơn giản bằng Express.js.
[ ] Kết nối cơ sở dữ liệu MongoDB và thực hiện các thao tác CRUD.
[ ] Xây dựng REST API hoàn chỉnh với xác thực JWT.
[ ] Deploy ứng dụng lên Render hoặc Vercel.`
        };

        const messages = [systemPrompt, ...recentHistory, { role: "user", content: message }];

        console.log("📡 Đang gửi tin nhắn đến Google Gemini...");
        const reply = await callGroqAPI(messages);

        // Lưu vào cơ sở dữ liệu với Session
        let chatRecord;
        if (sessionId) {
            chatRecord = await ChatSession.findById(sessionId);
        }

        if (!chatRecord) {
            // Tạo phiên mới, lấy tiêu đề từ tin nhắn đầu tiên
            const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
            chatRecord = new ChatSession({ userId, title, messages: [] });
        }

        chatRecord.messages.push({ role: 'user', content: message });
        chatRecord.messages.push({ role: 'assistant', content: reply });
        await chatRecord.save();

        res.json({ success: true, response: reply, sessionId: chatRecord._id });
    } catch (error) {
        console.error("❌ Groq Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 1.1 Lấy danh sách các phiên chat
app.get('/api/ai/sessions', authMiddleware, async (req, res) => {
    try {
        const sessions = await ChatSession.find({ userId: req.user.id })
            .select('_id title updatedAt')
            .sort({ updatedAt: -1 });
        res.json({ success: true, sessions });
    } catch (error) {
        console.error("❌ Lỗi lấy danh sách session:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 1.2 Lấy chi tiết lịch sử một phiên chat
app.get('/api/ai/sessions/:id', authMiddleware, async (req, res) => {
    try {
        const chatRecord = await ChatSession.findOne({ _id: req.params.id, userId: req.user.id });
        if (!chatRecord) {
            return res.json({ success: true, history: [] });
        }
        res.json({ success: true, history: chatRecord.messages, title: chatRecord.title });
    } catch (error) {
        console.error("❌ Lỗi lấy chi tiết session:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 1.3 Xóa một phiên chat
app.delete('/api/ai/sessions/:id', authMiddleware, async (req, res) => {
    try {
        await ChatSession.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true, message: 'Đã xóa lịch sử trò chuyện' });
    } catch (error) {
        console.error("❌ Lỗi xóa session chat:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Generate Goals API
app.post('/api/ai/generate-goals', authMiddleware, async (req, res) => {
    try {
        const { chatHistory, timeframe } = req.body;
        const userId = req.user.id;

        // ── Lấy Trust Score để điều chỉnh số lượng goal AI tạo ──
        let trustScore = 100;
        let maxGoals = 8;
        let minGoals = 3;
        try {
            const user = await User.findOne({ id: userId });
            if (user && typeof user.trustScore === 'number') {
                trustScore = user.trustScore;
            }
        } catch (e) { console.warn('[TrustScore] Không lấy được:', e.message); }

        // Trust Score ảnh hưởng số lượng goal AI tạo:
        //   100 điểm  → 5-13 goals
        //   50-99     → 4-10 goals
        //   1-49      → 1-4 goals
        //   0 điểm    → 1-2 goals
        if (trustScore >= 100) {
            minGoals = 5; maxGoals = 13;
        } else if (trustScore >= 50) {
            minGoals = 4; maxGoals = 10;
        } else if (trustScore >= 1) {
            minGoals = 1; maxGoals = 4;
        } else {
            minGoals = 1; maxGoals = 2;
        }

        console.log(`[AI] Trust Score: ${trustScore} → cho phép tạo ${minGoals}-${maxGoals} mục tiêu`);

        // Chi lay 15 tin nhan cuoi de khong bi overload context nhung van du thong tin
        const conversation = (chatHistory || []).slice(-15).map(m => `${m.role}: ${m.content}`).join('\n');

        const today = new Date();
        const currentDateStr = today.toISOString().split('T')[0];

        const prompt = `
        Hom nay la ngay ${currentDateStr}. 
        Nguoi dung muon hoan thanh CAC muc tieu trong khoang thoi gian: ${timeframe || 'chua xac dinh'}.
        Diem uy tin (Trust Score) cua nguoi dung: ${trustScore}/100.
        
        NHIEM VU: Dua tren cuoc hoi thoai sau, hay phan tich ky va tao ra mot danh sach ${minGoals}-${maxGoals} muc tieu SMART chi tiet.
        Hoi thoai:
        ${conversation}

        YEU CAU QUAN TRONG: 
        1. Chia nho cac muc tieu lon thanh cac buoc thuc hien cu the.
        2. Moi muc tieu phai co 'title', 'description', 'deadline' (YYYY-MM-DD), 'priority' ('high', 'medium', 'low'), va 'tags' (mang chuoi).
        3. Tra ve JSON duoi dang mot doi tuong co khoa "goals" la mot mang cac muc tieu.
        4. So luong muc tieu toi thieu la ${minGoals} va toi da la ${maxGoals}.
        
        Vi du ket qua:
        {
            "goals": [
                {
                    "title": "Hoc 50 tu vung moi",
                    "description": "Su dung Flashcard de ghi nho 10 tu moi moi ngay",
                    "deadline": "2024-06-15",
                    "priority": "high",
                    "tags": ["hoc tap", "ky nang"]
                }
            ]
        }
        Chi tra ve JSON, khong giai thich gi them.
        `;

        console.log("[AI] Dang yeu cau Gemini tao danh sach muc tieu...");
        const jsonString = await callGroqAPI([
            { role: "system", content: "Ban la tro ly thiet lep muc tieu, luon tra ve ket qua JSON chuan." },
            { role: "user", content: prompt }
        ], true);

        // Helper function de parse (se duoc dinh nghia ben ngoai hoac inline)
        const parseGoals = function parseAIGoals(jsonString) {
            try {
                // Step 1: Clean markdown blocks if present
                let cleaned = jsonString.trim();
                if (cleaned.startsWith('```')) {
                    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
                }

                // Step 2: Try parsing directly
                let data;
                try {
                    data = JSON.parse(cleaned);
                } catch (e) {
                    // Step 3: Try to find the first { or [ and last } or ]
                    const startIdx = Math.min(
                        cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : Infinity,
                        cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : Infinity
                    );
                    const endIdx = Math.max(
                        cleaned.lastIndexOf('}'),
                        cleaned.lastIndexOf(']')
                    );

                    if (startIdx !== Infinity && endIdx !== -1 && endIdx > startIdx) {
                        data = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
                    } else {
                        throw e;
                    }
                }

                // Step 4: Extract the array
                if (Array.isArray(data)) return data;
                if (data.goals && Array.isArray(data.goals)) return data.goals;
                if (data.data && Array.isArray(data.data)) return data.data;

                // If it's a single object that looks like a goal, wrap it in array
                if (data.title || data.description) return [data];

                return [];
            } catch (err) {
                console.error('[AI Parse Error] String:', jsonString);
                throw new Error('Khong the doc du lieu tu AI: ' + err.message);
            }
        };
        const rawGoals = parseGoals(jsonString);

        if (!rawGoals || rawGoals.length === 0) {
            throw new Error('AI khong tim thay thong tin de tao muc tieu. Hay tro chuyen them voi AI.');
        }

        const nowDate = new Date();
        const validGoals = rawGoals.map((g, idx) => {
            const deadlineStr = g.deadline || nowDate.toISOString().split('T')[0];
            const deadline = new Date(deadlineStr);
            const diffTime = deadline - nowDate;
            const daysUntilDeadline = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let autoCategory = 'monthly';
            if (daysUntilDeadline <= 14) autoCategory = 'weekly';
            else if (daysUntilDeadline <= 60) autoCategory = 'monthly';
            else if (daysUntilDeadline <= 400) autoCategory = 'yearly';
            else autoCategory = 'long-term';

            return {
                title: g.title || 'Muc tieu moi',
                description: g.description || '',
                category: autoCategory,
                priority: ['high', 'medium', 'low'].includes(g.priority) ? g.priority : 'medium',
                deadline: deadlineStr,
                tags: Array.isArray(g.tags) ? g.tags.map(t => String(t).toLowerCase().trim()) : [],
                id: 'goal_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 4),
                status: 'active'
            };
        });

        console.log(`[AI] Da tao thanh cong ${validGoals.length} muc tieu.`);
        res.json({ success: true, goals: validGoals });

    } catch (error) {
        console.error('[GenerateGoals] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});
// --- GOAL VERIFICATION ROUTE ---
// POST /api/goals/verify
// Body: { goalId, goalTitle, goalDescription, reportContent, proofUrl }
// Returns: { approved, message, confidenceScore }
app.post('/api/goals/verify', authMiddleware, async (req, res) => {
    try {
        const { goalId, goalTitle, goalDescription, reportContent, proofUrl } = req.body;

        // ── Validate đầu vào ──────────────────────────────────
        if (!reportContent || typeof reportContent !== 'string' || reportContent.trim().length < 5) {
            return res.status(400).json({ success: false, error: 'Nội dung báo cáo không được để trống.' });
        }
        if (!goalDescription && !goalTitle) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin mục tiêu.' });
        }

        // ── System Prompt – Người giám sát khắt khe ──────────
        const systemPrompt = `Bạn là một Người Giám Sát Tiến Độ chuyên nghiệp với tiêu chuẩn cực cao.
Nhiệm vụ của bạn: Đánh giá xem báo cáo của người dùng có đủ bằng chứng để xác nhận hoàn thành mục tiêu hay không.

NGUYÊN TẮC XÉT DUYỆT:
1. Báo cáo quá ngắn hoặc chung chung (dưới 50 ký tự, hoặc chỉ là "xong", "done", "hoàn thành", "tôi đã làm") → TỪ CHỐI ngay, yêu cầu giải trình cụ thể.
2. Báo cáo có dữ liệu nhưng KHÔNG liên quan đến mục tiêu đã đặt ra → TỪ CHỐI, giải thích lý do không khớp.
3. Báo cáo có dữ liệu cụ thể, kết quả đo lường được, và khớp với mục tiêu → DUYỆT.
4. Có URL minh chứng hợp lệ (GitHub, link ảnh, v.v.) → Tăng điểm tin cậy thêm.

THANG ĐIỂM confidenceScore (0.0 – 1.0):
- 0.0 – 0.2: Mơ hồ, không liên quan
- 0.3 – 0.5: Có cố gắng nhưng thiếu bằng chứng
- 0.6 – 0.79: Khá tốt, đủ để duyệt
- 0.8 – 1.0: Rất chi tiết, có minh chứng rõ ràng

ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC - chỉ JSON, không thêm gì khác):
{
  "approved": <true | false>,
  "message": "<Phản hồi bằng tiếng Việt, rõ ràng, 1–3 câu>",
  "confidenceScore": <số 0.0 đến 1.0>
}`;

        const userMessage = `MỤC TIÊU: ${goalTitle || '(không có tiêu đề)'}
MÔ TẢ MỤC TIÊU: ${goalDescription || '(không có mô tả)'}
BÁO CÁO CỦA NGƯỜI DÙNG: ${reportContent.trim()}
${proofUrl ? `LINK MINH CHỨNG: ${proofUrl}` : 'LINK MINH CHỨNG: (không có)'}

Hãy đánh giá và trả về JSON theo đúng định dạng.`;

        console.log('📡 [Verify] Gửi báo cáo đến Groq AI để thẩm định...');

        const rawJson = await callGroqAPI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ], true); // jsonMode = true

        // ── Parse & validate kết quả ──────────────────────────
        let result;
        try {
            result = JSON.parse(rawJson);
        } catch {
            throw new Error('AI trả về định dạng không hợp lệ.');
        }

        if (typeof result.approved !== 'boolean') throw new Error('Thiếu trường "approved".');
        if (typeof result.message !== 'string') throw new Error('Thiếu trường "message".');
        if (typeof result.confidenceScore !== 'number') result.confidenceScore = result.approved ? 0.75 : 0.2;

        result.confidenceScore = Math.min(1, Math.max(0, Math.round(result.confidenceScore * 100) / 100));

        // ── Nếu AI duyệt → cập nhật Goal trong DB + thưởng Trust Score ────────────
        if (result.approved && goalId) {
            try {
                // Lấy goal để xác định priority (cấp độ)
                const goalDoc = await Goal.findOne({ id: goalId, userId: req.user.id });

                await Goal.findOneAndUpdate(
                    { id: goalId, userId: req.user.id },
                    {
                        $set: { aiFeedback: result.message, status: 'checking' },
                        $push: {
                            verificationHistory: {
                                note: reportContent.trim(),
                                proofLinks: proofUrl ? [proofUrl] : [],
                                reviewResult: 'approved',
                                reviewComment: result.message,
                                submittedAt: new Date()
                            }
                        }
                    }
                );

                // ── Thưởng Trust Score khi hoàn thành mục tiêu ──
                // Cơ bản: high = +4, medium = +3, low = +2
                // Bonus: +2 nếu có proof URL và confidenceScore >= 0.8
                let tcReward = 2; // mặc định
                if (goalDoc) {
                    if (goalDoc.priority === 'high') tcReward = 4;
                    else if (goalDoc.priority === 'medium') tcReward = 3;
                    else tcReward = 2; // low
                }

                // Bonus +2 nếu có bằng chứng đầy đủ và AI đánh giá cao
                let tcBonus = 0;
                if (proofUrl && result.confidenceScore >= 0.8) {
                    tcBonus = 2;
                }

                const totalReward = tcReward + tcBonus;

                // Cập nhật Trust Score trong DB
                const user = await User.findOne({ id: req.user.id });
                if (user) {
                    const newScore = Math.min(200, (user.trustScore ?? 100) + totalReward);
                    await User.findOneAndUpdate(
                        { id: req.user.id },
                        { $set: { trustScore: newScore } }
                    );
                    console.log(`⭐ [Verify] TC +${totalReward} (base: +${tcReward}, bonus: +${tcBonus}). New TC: ${newScore}`);
                    result.tcReward = totalReward;
                    result.newTrustScore = newScore;
                }

                console.log(`✅ [Verify] Goal ${goalId} đã được AI duyệt.`);
            } catch (dbErr) {
                console.error('⚠️ [Verify] Lỗi cập nhật DB (không ảnh hưởng response):', dbErr.message);
            }
        }

        res.json({ success: true, ...result });

    } catch (error) {
        console.error('❌ [Verify] Lỗi:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- NEGOTIATE EDIT ROUTE ---
// POST /api/goals/:id/request-edit
// Body: { reason }
// AI đóng vai Coach — đánh giá lý do muốn sửa goal:
//   canEdit: true  → lý do hợp lý, cho phép sửa
//   canEdit: false → lý do lười biếng, đưa lời khuyên động lực
app.post('/api/goals/:id/request-edit', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const reason = (req.body.reason || '').trim();

        if (!reason || reason.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Vui lòng giải thích lý do muốn thay đổi lộ trình (ít nhất 10 ký tự).'
            });
        }

        // Lấy goal để cung cấp ngữ cảnh cho AI
        const goal = await Goal.findOne({ id, userId });
        if (!goal) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy mục tiêu.' });
        }

        // ── System Prompt: AI Coach thương lượng ─────────────
        const systemPrompt = `Bạn là một Coach mục tiêu cá nhân chuyên nghiệp, thẳng thắn nhưng đồng cảm.
Nhiệm vụ: Đánh giá xem lý do người dùng muốn thay đổi lộ trình mục tiêu có hợp lý không.

TIÊU CHÍ CHẤP NHẬN (canEdit: true):
- Hoàn cảnh bất khả kháng: bệnh, tai nạn, mất người thân, thiên tai.
- Sự kiện đột xuất quan trọng: công việc khẩn cấp, deadline sếp giao.
- Thông tin mới làm thay đổi hoàn toàn kế hoạch (vd: trúng tuyển trường mới).
- Lý do liên quan đến sức khỏe thể chất hoặc tâm thần.

TIÊU CHÍ TỪ CHỐI (canEdit: false):
- Lý do mơ hồ: "khó quá", "không có thời gian", "mệt", "lười", "chán".
- Ngại cố gắng hoặc muốn trốn tránh trách nhiệm.
- Lý do không liên quan đến mục tiêu.
- Chỉ muốn deadline dễ hơn mà không có lý do chính đáng.

PHONG CÁCH PHẢN HỒI:
- Nếu TỪ CHỐI: Thẳng thắn, không khoan nhượng nhưng có lời khuyên động lực cụ thể.
- Nếu CHẤP NHẬN: Đồng cảm, khích lệ tiếp tục sau khi điều chỉnh.
- Phản hồi bằng tiếng Việt, 2–4 câu, súc tích, có cá tính.

ĐỊNH DẠNG JSON BẮT BUỘC (chỉ JSON, không thêm gì):
{
  "canEdit": <true | false>,
  "coachMessage": "<phản hồi của coach>",
  "severity": <"reasonable" | "lazy" | "urgent">
}`;

        const userMessage = `MỤC TIÊU: ${goal.title}
MÔ TẢ: ${goal.description || '(không có)'}
DEADLINE: ${goal.deadline}
LÝ DO MUỐN SỬA: ${reason}

Hãy đánh giá và trả về JSON.`;

        console.log('📡 [NegotiateEdit] Gửi yêu cầu thương lượng đến AI Coach...');

        const rawJson = await callGroqAPI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ], true);

        let result;
        try { result = JSON.parse(rawJson); }
        catch { throw new Error('AI trả về định dạng không hợp lệ.'); }

        if (typeof result.canEdit !== 'boolean') throw new Error('Thiếu trường canEdit.');

        // Ghi lại yêu cầu thương lượng vào goal (không update status)
        if (result.canEdit) {
            await Goal.findOneAndUpdate(
                { id, userId },
                { $set: { aiFeedback: `[Yêu cầu sửa được duyệt] ${result.coachMessage}` } }
            );
        }

        res.json({
            success: true,
            canEdit: result.canEdit,
            coachMessage: result.coachMessage || '',
            severity: result.severity || (result.canEdit ? 'reasonable' : 'lazy'),
        });

    } catch (error) {
        console.error('❌ [NegotiateEdit] Lỗi:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ABANDON GOAL ROUTE ---

// POST /api/goals/:id/abandon
// Body: { goalId, reason? }
// Logic:
//   1. Cập nhật goal: status = 'abandoned', abandonedAt, abandonReason
//   2. Trừ 10 điểm trustScore của User (không xuống dưới 0)
//   3. Tăng abandonCount của User
app.post('/api/goals/:id/abandon', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;            // custom goal.id từ frontend
        const userId = req.user.id;
        const reason = (req.body.reason || '').trim().slice(0, 300);

        // ── Tìm goal theo custom id + userId (bảo mật) ──────
        const goal = await Goal.findOne({ id, userId });
        if (!goal) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy mục tiêu.' });
        }

        if (goal.status === 'abandoned') {
            return res.status(400).json({ success: false, error: 'Mục tiêu này đã được từ bỏ trước đó.' });
        }
        if (goal.status === 'completed') {
            return res.status(400).json({ success: false, error: 'Không thể từ bỏ mục tiêu đã hoàn thành.' });
        }

        // ── 1. Cập nhật Goal ─────────────────────────────────
        goal.status = 'abandoned';
        goal.abandonedAt = new Date();
        goal.abandonReason = reason || 'Không có lý do được ghi nhận.';
        await goal.save();

        // ── 2 & 3. Cập nhật User: trừ điểm + tăng count ─────
        const PENALTY = 10;
        const user = await User.findOne({ id: userId });
        let newScore = 100;
        let newCount = 1;

        if (user) {
            newScore = Math.max(0, (user.trustScore ?? 100) - PENALTY);
            newCount = (user.abandonCount ?? 0) + 1;
            await User.findOneAndUpdate(
                { id: userId },
                { $set: { trustScore: newScore, abandonCount: newCount } }
            );
        }

        console.log(`⚑ [Abandon] User ${userId} từ bỏ goal "${goal.title}". TrustScore: ${newScore}`);

        res.json({
            success: true,
            message: `Mục tiêu đã được đánh dấu là từ bỏ. Trust Score của bạn còn ${newScore} điểm.`,
            trustScore: newScore,
            abandonCount: newCount,
        });

    } catch (error) {
        console.error('❌ [Abandon] Lỗi:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- DELETE ACCOUNT ROUTE ---
app.delete('/api/users/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Xóa toàn bộ data của user
        await Goal.deleteMany({ userId });
        await ChatSession.deleteMany({ userId });
        await User.deleteOne({ id: userId });

        console.log(`🗑️ [DeleteAccount] Đã xóa tài khoản user ${userId} và toàn bộ dữ liệu.`);

        res.json({ success: true, message: 'Đã xóa tài khoản và toàn bộ dữ liệu thành công.' });
    } catch (error) {
        console.error('❌ [DeleteAccount] Lỗi:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- EMAIL NOTIFICATIONS ROUTE ---
app.post('/api/notifications/completion', authMiddleware, async (req, res) => {
    try {
        const { userId, email, goalTitle } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Thiếu email để gửi thông báo' });
        }

        const mailOptions = {
            from: `"GoalFlow Team" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🎉 Chúc mừng bạn đã hoàn thành mục tiêu!',
            text: `Chào bạn,

Thật tuyệt vời! Chúng tôi nhận thấy bạn vừa hoàn thành mục tiêu: "${goalTitle}".

Những nỗ lực nhỏ mỗi ngày cuối cùng cũng tạo ra kết quả lớn. Đội ngũ GoalFlow xin gửi lời chúc mừng chân thành nhất đến bạn. Hãy tiếp tục giữ vững phong độ này nhé!

Đừng quên đặt thêm những mục tiêu mới và tiếp tục hành trình phát triển bản thân cùng GoalFlow.

Chúc bạn luôn thành công!

Trân trọng,
Đội ngũ GoalFlow`
        };

        // Gửi email chạy ngầm không cần await để tránh làm chậm UI người dùng
        transporter.sendMail(mailOptions)
            .then(() => console.log(`✅ Completion notification email sent to ${email} for goal "${goalTitle}"`))
            .catch((err) => console.error(`❌ Error sending completion email:`, err.message));

        res.json({ success: true });
    } catch (error) {
        console.error(`❌ Lỗi gửi thông báo completion:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES — /api/admin/*
// ═══════════════════════════════════════════════════════════════

// [ADMIN] Đăng nhập Admin — một cổng đăng nhập, phân quyền bên trong (RBAC)
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Vui lòng nhập email và mật khẩu' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(403).json({ success: false, error: 'Tài khoản không tồn tại' });
        }

        // Kiểm tra quyền Admin theo RBAC: ưu tiên role, fallback về isAdmin cũ
        const hasAdminRole = user.role === 'admin' || user.isAdmin === true;
        if (!hasAdminRole) {
            return res.status(403).json({ success: false, error: 'Tài khoản không có quyền Admin' });
        }

        if (user.isBanned) {
            return res.status(403).json({ success: false, error: 'Tài khoản đã bị khóa' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Mật khẩu không chính xác' });
        }

        // Nhúng role vào JWT payload
        const token = jwt.sign(
            { id: user.id, email: user.email, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, email: user.email, role: 'admin' }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Thống kê tổng quan
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const [totalUsers, newUsersThisWeek, totalGoals, totalChats,
            activeGoals, completedGoals, abandonedGoals, checkingGoals] = await Promise.all([
                User.countDocuments({ isAdmin: { $ne: true } }),
                User.countDocuments({ isAdmin: { $ne: true }, createdAt: { $gte: weekAgo.toISOString() } }),
                Goal.countDocuments(),
                ChatSession.countDocuments(),
                Goal.countDocuments({ status: 'active' }),
                Goal.countDocuments({ status: 'completed' }),
                Goal.countDocuments({ status: 'abandoned' }),
                Goal.countDocuments({ status: 'checking' }),
            ]);

        const recentUsers = await User.find({ isAdmin: { $ne: true } })
            .select('name email trustScore createdAt isBanned')
            .sort({ createdAt: -1 }).limit(5);

        const recentGoals = await Goal.find()
            .select('title status priority createdAt userId')
            .sort({ createdAt: -1 }).limit(5);

        res.json({
            success: true,
            stats: {
                totalUsers, newUsersThisWeek, totalGoals, totalChats,
                goalsByStatus: { active: activeGoals, completed: completedGoals, abandoned: abandonedGoals, checking: checkingGoals },
                recentUsers, recentGoals
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Danh sách users (phân trang + tìm kiếm)
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        const filter = { isAdmin: { $ne: true } };
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
            User.countDocuments(filter)
        ]);

        // Đếm số goals của mỗi user
        const usersWithGoals = await Promise.all(users.map(async u => {
            const goalCount = await Goal.countDocuments({ userId: u.id });
            return { ...u.toObject(), goalCount };
        }));

        res.json({ success: true, users: usersWithGoals, total, page, pages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Xóa user
app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await Goal.deleteMany({ userId: id });
        await ChatSession.deleteMany({ userId: id });
        await User.deleteOne({ id });
        res.json({ success: true, message: 'Đã xóa người dùng và toàn bộ dữ liệu' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Cập nhật Trust Score
app.patch('/api/admin/users/:id/trust-score', adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { trustScore } = req.body;
        if (typeof trustScore !== 'number' || trustScore < 0 || trustScore > 200) {
            return res.status(400).json({ success: false, error: 'Trust Score phải từ 0 đến 200' });
        }
        await User.findOneAndUpdate({ id }, { $set: { trustScore } });
        res.json({ success: true, message: `Đã cập nhật Trust Score thành ${trustScore}` });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Khóa / Mở khóa tài khoản
app.patch('/api/admin/users/:id/ban', adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ id });
        if (!user) return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng' });
        const newBanned = !user.isBanned;
        await User.findOneAndUpdate({ id }, { $set: { isBanned: newBanned, bannedAt: newBanned ? new Date() : null } });
        res.json({ success: true, isBanned: newBanned, message: newBanned ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Danh sách tất cả Goals
app.get('/api/admin/goals', adminMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const status = req.query.status || '';
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (search) filter.title = { $regex: search, $options: 'i' };

        const [goals, total] = await Promise.all([
            Goal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Goal.countDocuments(filter)
        ]);

        // Lấy tên user cho mỗi goal
        const goalsWithUser = await Promise.all(goals.map(async g => {
            const user = await User.findOne({ id: g.userId }).select('name email');
            return { ...g.toObject(), userName: user ? user.name : 'Unknown', userEmail: user ? user.email : '' };
        }));

        res.json({ success: true, goals: goalsWithUser, total, page, pages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Cập nhật trạng thái Goal
app.patch('/api/admin/goals/:id/status', adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['active', 'checking', 'completed', 'abandoned'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Trạng thái không hợp lệ' });
        }
        const update = { status };
        if (status === 'completed') update.completedAt = new Date().toISOString();
        await Goal.findByIdAndUpdate(req.params.id, { $set: update });
        res.json({ success: true, message: 'Đã cập nhật trạng thái mục tiêu' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Xóa Goal
app.delete('/api/admin/goals/:id', adminMiddleware, async (req, res) => {
    try {
        await Goal.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa mục tiêu' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Danh sách Chat Sessions
app.get('/api/admin/chats', adminMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        const filter = {};
        if (search) filter.title = { $regex: search, $options: 'i' };

        const [chats, total] = await Promise.all([
            ChatSession.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
            ChatSession.countDocuments(filter)
        ]);

        const chatsWithUser = await Promise.all(chats.map(async c => {
            const user = await User.findOne({ id: c.userId }).select('name email');
            return {
                _id: c._id, title: c.title, userId: c.userId,
                messageCount: c.messages.length,
                userName: user ? user.name : 'Unknown',
                userEmail: user ? user.email : '',
                createdAt: c.createdAt, updatedAt: c.updatedAt
            };
        }));

        res.json({ success: true, chats: chatsWithUser, total, page, pages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Chi tiết một Chat Session
app.get('/api/admin/chats/:id', adminMiddleware, async (req, res) => {
    try {
        const chat = await ChatSession.findById(req.params.id);
        if (!chat) return res.status(404).json({ success: false, error: 'Không tìm thấy cuộc trò chuyện' });
        const user = await User.findOne({ id: chat.userId }).select('name email');
        res.json({ success: true, chat: { ...chat.toObject(), userName: user ? user.name : 'Unknown' } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// [ADMIN] Xóa Chat Session
app.delete('/api/admin/chats/:id', adminMiddleware, async (req, res) => {
    try {
        await ChatSession.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa cuộc trò chuyện' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Phục vụ trang Admin ───────────────────────────────────────
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/admin.html'));
});

// Cho phép Express đọc các file tĩnh (như styles.css)
app.use(express.static(path.join(__dirname, '../Frontend')));

// Khi có người vào trang chủ ('/'), ném file index.html ra cho họ xem
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// Start server function
async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════╗
║      GoalFlow Server Running         ║
║  Port: ${PORT}                          ║
║  Model: Google Gemini             ║
╚══════════════════════════════════════╝
        `);
    });
}

startServer();

