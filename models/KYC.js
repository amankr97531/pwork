const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    panNumber: {
        type: String,
        default: '',
        uppercase: true,
    },
    panImage: {
        type: String,
        default: '',
    },
    aadhaarNumber: {
        type: String,
        default: '',
    },
    aadhaarFrontImage: {
        type: String,
        default: '',
    },
    aadhaarBackImage: {
        type: String,
        default: '',
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('KYC', kycSchema);
