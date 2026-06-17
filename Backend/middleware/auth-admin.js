const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Không có token' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findOne({ id: decoded.id });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Tài khoản không tồn tại' });
        }
        if (!user.isAdmin) {
            return res.status(403).json({ success: false, error: 'Forbidden: Chỉ admin mới có quyền truy cập' });
        }

        req.user = decoded;
        req.adminUser = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Token không hợp lệ hoặc đã hết hạn' });
    }
};

module.exports = adminMiddleware;
