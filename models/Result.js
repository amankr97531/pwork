const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    game: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    firstDigit: {
        type: String,
        default: '',
    },
    secondDigit: {
        type: String,
        default: '',
    },
    thirdDigit: {
        type: String,
        default: '',
    },
    fullResult: {
        type: String,
        default: '',
    },
    status: {
        type: String,
        enum: ['pending', 'declared'],
        default: 'pending',
    },
    declaredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Auto-compute status before save
resultSchema.pre('save', function (next) {
    if (this.fullResult) {
        this.status = 'declared';
    }
    next();
});

module.exports = mongoose.model('Result', resultSchema);
