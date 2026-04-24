const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    referredUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    level: {
        type: Number,
        enum: [1, 2, 3],
        default: 1,
    },
    amount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Commission', commissionSchema);
