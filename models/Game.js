const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Game name is required'],
        trim: true,
    },
    description: {
        type: String,
        default: '',
    },
    city: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
    },
    openTime: {
        type: String,
        required: [true, 'Open time is required'],
    },
    closeTime: {
        type: String,
        required: [true, 'Close time is required'],
    },
    resultTime: {
        type: String,
        required: [true, 'Result time is required'],
    },
    startDate: {
        type: String,
        default: '',
    },
    endDate: {
        type: String,
        default: '',
    },
    minBetAmount: {
        type: Number,
        default: 10,
    },
    maxBetAmount: {
        type: Number,
        default: 10000,
    },

    jodiMultiplier: {
        type: Number,
        default: 90,
    },
    andarMultiplier: {
        type: Number,
        default: 9,
    },
    baharMultiplier: {
        type: Number,
        default: 9,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Game', gameSchema);
