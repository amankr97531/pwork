const mongoose = require('mongoose');

const moneyRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['add', 'withdraw'],
        required: true,
    },
    source: {
        type: String,
        enum: ['ecuzen', 'pod', 'gsk', 'unified'],
        default: 'unified',
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
    },
    method: {
        type: String,
        enum: ['upi', 'bank_transfer'],
        default: 'upi',
    },
    // For withdrawals
    accountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    // For add money
    phoneNumber: { type: String, default: '' },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('MoneyRequest', moneyRequestSchema);
