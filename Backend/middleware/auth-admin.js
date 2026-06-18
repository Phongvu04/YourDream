const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware: isAdmin (RBAC - Role-Based Access Control)
 *
 * Pipeline xác thực 3 bước:
 *   1. Kiểm tra JWT token hợp lệ trong header Authorization
 *   2. Tìm user trong DB, đảm bảo tài khoản tồn tại và không bị ban
 *   3. Kiểm tra role === 'admin' (hoặc isAdmin:true cho dữ liệu cũ)
 *      → next()  nếu đúng quyền
 *      → 403     nếu không có quyền Admin
 *
 * Sử dụng:
 *   app.get('/api/admin/stats', adminMiddleware, handler)
 */
const adminMiddleware = async (req, res, next) => {
    try {
        // ── Bước 1: Lấy và verify JWT token ──────────────────
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Không có token xác thực'
            });
        }

        const token   = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ── Bước 2: Kiểm tra user tồn tại trong DB ───────────
        const user = await User.findOne({ id: decoded.id });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Tài khoản không tồn tại'
            });
        }

        if (user.isBanned) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: Tài khoản đã bị khóa'
            });
        }

        // ── Bước 3: Kiểm tra quyền Admin (RBAC) ──────────────
        // Hỗ trợ cả 2 cách: role mới và isAdmin cũ (backward-compatible)
        const hasAdminRole = user.role === 'admin' || user.isAdmin === true;
        if (!hasAdminRole) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: Chỉ Admin mới có quyền truy cập tài nguyên này'
            });
        }

        // Gắn thông tin user vào request để các route handler sử dụng
        req.user      = decoded;  // payload JWT: { id, email, role, iat, exp }
        req.adminUser = user;     // Mongoose document đầy đủ từ DB
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Token không hợp lệ hoặc đã hết hạn'
        });
    }
};

module.exports = adminMiddleware;
