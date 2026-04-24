const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    game: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        required: true,
    },
    betType: {
        type: String,
        enum: ['jantri', 'crossing', 'notoNo'],
        required: true,
    },
    section: {
        type: String,
        enum: ['jodi', 'andar', 'bahar'],
        default: 'jodi',
    },
    fromNumber: { type: String, default: '' },
    toNumber: { type: String, default: '' },
    jantriGroup: { type: String, default: '' },
    numbers: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: [true, 'Bet amount is required'],
        min: 1,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    source: {
        type: String,
        enum: ['ecuzen', 'pod', 'gsk', 'unified'],
        default: 'unified',
    },
    status: {
        type: String,
        enum: ['pending', 'won', 'lost'],
        default: 'pending',
    },
    winAmount: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Bet', betSchema);
