const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        id:       { type: String, required: true, unique: true },
        name:     { type: String, required: true },
        email:    { type: String, required: true, unique: true },
        password: { type: String, required: true },
        createdAt:{ type: String },

        // ── Trust Score ──────────────────────────────────────
        // Điểm uy tín của người dùng.
        // Bắt đầu ở 100, mỗi lần từ bỏ mục tiêu trừ 50 điểm.
        // Không bao giờ xuống dưới 0.
        trustScore: {
            type: Number,
            default: 100,
            min: 0,
        },

        // ── Abandon history ──────────────────────────────────
        // Tổng số lần đã từ bỏ mục tiêu (để thống kê nhanh).
        abandonCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // ── Admin flag ───────────────────────────────────────
        isAdmin: {
            type: Boolean,
            default: false,
        },

        // ── Ban status ───────────────────────────────────────
        isBanned: {
            type: Boolean,
            default: false,
        },
        bannedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
