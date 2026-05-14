const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const User = require('./models/User');
const Goal = require('./models/Goal');
const ChatSession = require('./models/ChatSession');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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

    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error);
        process.exit(1); // Dừng server nếu không kết nối được DB
    }
}

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

async function sendWelcomeEmail(toEmail, userName) {
    const mailOptions = {
        from: `"GoalFlow Team" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Chào mừng bạn đến với GoalFlow',
        text: `Chào bạn,

Cảm ơn bạn đã tin tưởng và sử dụng website GoalFlow để quản lý mục tiêu cá nhân của mình. Chúng tôi tạo ra nền tảng này với mong muốn giúp bạn biến những kế hoạch trên giấy thành hành động thực tế mỗi ngày.

Nếu bạn có bất kỳ góp ý hoặc cần hỗ trợ, hãy phản hồi lại email này. Đội ngũ của chúng tôi luôn sẵn sàng đồng hành cùng bạn trên hành trình chinh phục mục tiêu.

Chúc bạn một ngày làm việc hiệu quả và đầy động lực!

Trân trọng.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Welcome email sent to ${toEmail}`);
    } catch (error) {
        console.error(`❌ Error sending email to ${toEmail}:`, error.message);
    }
}

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !email.toLowerCase().endsWith('@gmail.com')) {
            return res.status(400).json({ success: false, error: 'Chỉ chấp nhận địa chỉ @gmail.com' });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Mật khẩu phải từ 6 ký tự trở lên' });
        }

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, error: 'Email đã được đăng ký' });
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

        // Gửi email chào mừng chạy ngầm
        sendWelcomeEmail(email, name).catch(console.error);

        res.json({ success: true, message: 'Đăng ký thành công. Vui lòng đăng nhập.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: 'Tài khoản không tồn tại' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Mật khẩu không chính xác' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
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
        
        const newPassword = Math.random().toString(36).slice(-8); // Generate 8-character random password
        
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        
        const mailOptions = {
            from: `"GoalFlow Team" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Khôi phục mật khẩu GoalFlow',
            text: `Chào ${user.name},\n\nMật khẩu của bạn đã được đặt lại thành công.\n\nMật khẩu mới của bạn là: ${newPassword}\n\nVui lòng sử dụng mật khẩu này để đăng nhập hệ thống.\n\nTrân trọng,\nĐội ngũ GoalFlow`
        };
        
        // Send email in background
        transporter.sendMail(mailOptions).catch(console.error);
        
        res.json({ success: true, message: 'Mật khẩu mới đã được gửi vào email của bạn. Vui lòng kiểm tra hộp thư.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Vui lòng cung cấp đầy đủ mật khẩu' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Mật khẩu mới phải từ 6 ký tự trở lên' });
        }

        const user = await User.findOne({ id: req.user.id });
        if (!user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Mật khẩu hiện tại không chính xác' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- GOAL ROUTES ---

// Và lưu toàn bộ goals (frontend gửi mảng goals về để sync)
app.post('/api/goals', authMiddleware, async (req, res) => {
    try {
        const { goals } = req.body;
        const userId    = req.user.id;

        if (!goals || goals.length === 0) {
            // Xóa hết nếu frontend gửi mảng rỗng
            await Goal.deleteMany({ userId });
            return res.json({ success: true, saved: 0 });
        }

        // Chuẩn hóa dữ liệu trước khi lưu
        const VALID_STATUSES = ['active', 'checking', 'completed', 'abandoned'];
        const sanitized = goals.map(g => ({
            ...g,
            userId,
            // Map các giá trị status không hợp lệ về 'active'
            status: VALID_STATUSES.includes(g.status) ? g.status : 'active',
            // Đảm bảo milestones là mảng hợp lệ
            milestones: Array.isArray(g.milestones) ? g.milestones.map(m => ({
                task:  m.task  || 'Milestone',
                isDone: Boolean(m.isDone),
                proof: m.proof || '',
            })) : [],
        }));

        // Dùng bulkWrite upsert thay vì deleteMany + insertMany
        // → không mất dữ liệu nếu một goal bị lỗi
        const ops = sanitized.map(g => ({
            updateOne: {
                filter: { id: g.id, userId },
                update: { $set: g },
                upsert: true,
            }
        }));

        const result = await Goal.bulkWrite(ops, { ordered: false });

        // Xóa các goal trong DB không còn trong danh sách frontend gửi
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
            content: `Bạn là trợ lý GoalFlow. Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Luôn đặt câu hỏi để làm rõ mục tiêu. Hôm nay là ngày ${currentDateStr}.`
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
            { role: 'user',   content: userMessage }
        ], true); // jsonMode = true

        // ── Parse & validate kết quả ──────────────────────────
        let result;
        try {
            result = JSON.parse(rawJson);
        } catch {
            throw new Error('AI trả về định dạng không hợp lệ.');
        }

        if (typeof result.approved !== 'boolean') throw new Error('Thiếu trường "approved".');
        if (typeof result.message  !== 'string')  throw new Error('Thiếu trường "message".');
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
                        $set:  { aiFeedback: result.message, status: 'checking' },
                        $push: {
                            verificationHistory: {
                                note:          reportContent.trim(),
                                proofLinks:    proofUrl ? [proofUrl] : [],
                                reviewResult:  'approved',
                                reviewComment: result.message,
                                submittedAt:   new Date()
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
        const { id }   = req.params;
        const userId   = req.user.id;
        const reason   = (req.body.reason || '').trim();

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
            { role: 'user',   content: userMessage }
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
            success:      true,
            canEdit:      result.canEdit,
            coachMessage: result.coachMessage || '',
            severity:     result.severity    || (result.canEdit ? 'reasonable' : 'lazy'),
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
        const { id }    = req.params;            // custom goal.id từ frontend
        const userId    = req.user.id;
        const reason    = (req.body.reason || '').trim().slice(0, 300);

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
        goal.status        = 'abandoned';
        goal.abandonedAt   = new Date();
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
            success:      true,
            message:      `Mục tiêu đã được đánh dấu là từ bỏ. Trust Score của bạn còn ${newScore} điểm.`,
            trustScore:   newScore,
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

