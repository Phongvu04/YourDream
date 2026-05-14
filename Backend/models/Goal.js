const mongoose = require('mongoose');

// ──────────────────────────────────────────────
// Sub-schema: Milestone
// Mỗi milestone là một bước nhỏ trong quá trình
// thực hiện mục tiêu (goal).
// ──────────────────────────────────────────────
const milestoneSchema = new mongoose.Schema(
    {
        // Tên / mô tả công việc cần thực hiện
        task: {
            type: String,
            required: true,
            trim: true,
        },

        // Đánh dấu milestone đã hoàn thành hay chưa
        isDone: {
            type: Boolean,
            default: false,
        },

        // Bằng chứng hoàn thành (URL ảnh, link, mô tả, ...)
        proof: {
            type: String,
            default: '',
        },
    },
    { _id: true } // mỗi milestone có _id riêng để dễ cập nhật
);

// ──────────────────────────────────────────────
// Sub-schema: VerificationEntry
// Lưu lại mỗi lần người dùng báo cáo tiến độ
// để hệ thống / AI xét duyệt.
// ──────────────────────────────────────────────
const verificationEntrySchema = new mongoose.Schema(
    {
        // Thời điểm người dùng gửi báo cáo
        submittedAt: {
            type: Date,
            default: Date.now,
        },

        // Ghi chú / mô tả của người dùng khi báo cáo
        note: {
            type: String,
            default: '',
        },

        // Danh sách bằng chứng đính kèm (URL, tên file, ...)
        proofLinks: {
            type: [String],
            default: [],
        },

        // Kết quả xét duyệt: pending (chờ), approved (đạt),
        // rejected (không đạt)
        reviewResult: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },

        // Phản hồi của người xét duyệt (hoặc AI)
        reviewComment: {
            type: String,
            default: '',
        },
    },
    { _id: true }
);

// ──────────────────────────────────────────────
// Main Schema: Goal
// ──────────────────────────────────────────────
const goalSchema = new mongoose.Schema(
    {
        // ID tuỳ chỉnh (nếu cần đồng bộ với frontend)
        id: {
            type: String,
            required: true,
            unique: true,
        },

        // Tiêu đề mục tiêu
        title: {
            type: String,
            required: true,
            trim: true,
        },

        // Mô tả chi tiết mục tiêu
        description: {
            type: String,
            default: '',
        },

        // Danh mục: daily, weekly, monthly, yearly, ...
        category: {
            type: String,
            default: 'monthly',
        },

        // Hạn chót hoàn thành
        deadline: {
            type: String,
            default: '',
        },

        // Mức độ ưu tiên: low | medium | high
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },

        // ── TRƯỜNG MỚI ──────────────────────────────
        // Trạng thái vòng đời của goal:
        //   active    → đang thực hiện
        //   checking  → đang chờ AI / admin xét duyệt
        //   completed → đã hoàn thành và được xác nhận
        //   abandoned → đã từ bỏ (không xóa DB, lưu lịch sử)
        status: {
            type: String,
            enum: ['active', 'checking', 'completed', 'abandoned'],
            default: 'active',
        },

        // Nhãn / tag phân loại tự do
        tags: {
            type: [String],
            default: [],
        },

        // ID của người dùng sở hữu goal này
        userId: {
            type: String,
            required: true,
            index: true, // index để tăng tốc truy vấn theo userId
        },

        // Thời điểm hoàn thành (do frontend/server ghi)
        completedAt: {
            type: String,
            default: null,
        },

        // Thời điểm từ bỏ mục tiêu
        abandonedAt: {
            type: Date,
            default: null,
        },

        // Lý do từ bỏ (người dùng nhập, tuỳ chọn)
        abandonReason: {
            type: String,
            default: '',
        },

        // ── TRƯỜNG MỚI ──────────────────────────────
        // Danh sách các milestone (bước nhỏ) của goal.
        // Người dùng tự thêm, đánh dấu hoàn thành và
        // đính kèm bằng chứng cho từng bước.
        milestones: {
            type: [milestoneSchema],
            default: [],
        },

        // ── TRƯỜNG MỚI ──────────────────────────────
        // Nhận xét / phân tích của AI về tiến độ thực
        // hiện goal. Được cập nhật mỗi khi AI review.
        aiFeedback: {
            type: String,
            default: '',
        },

        // ── TRƯỜNG MỚI ──────────────────────────────
        // Lịch sử các lần người dùng gửi báo cáo tiến độ.
        // Mỗi phần tử là một VerificationEntry.
        verificationHistory: {
            type: [verificationEntrySchema],
            default: [],
        },
    },
    {
        // Tự động thêm createdAt và updatedAt do Mongoose quản lý
        timestamps: true,
    }
);

// ──────────────────────────────────────────────
// Virtual: tỉ lệ hoàn thành milestone (%)
// Không lưu vào DB, tính toán on-the-fly
// ──────────────────────────────────────────────
goalSchema.virtual('milestoneProgress').get(function () {
    if (!this.milestones || this.milestones.length === 0) return 0;
    const done = this.milestones.filter((m) => m.isDone).length;
    return Math.round((done / this.milestones.length) * 100);
});

module.exports = mongoose.model('Goal', goalSchema);
