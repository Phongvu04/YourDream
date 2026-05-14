const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: { type: String, default: "Cuộc trò chuyện mới" },
    messages: [{
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
