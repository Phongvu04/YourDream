const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    try {
        // Lấy token từ header Authorization
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Gắn thông tin user vào request (req.user)
        req.user = decoded; // { id, email, iat, exp }
        
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
    }
};

module.exports = authMiddleware;
