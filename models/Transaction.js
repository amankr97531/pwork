const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true,
    },
    category: {
        type: String,
        enum: ['add_money', 'withdraw', 'game_play', 'game_win', 'commission', 'recharge'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'rejected'],
        default: 'success',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Transaction', transactionSchema);
