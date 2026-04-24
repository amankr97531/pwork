const mongoose = require('mongoose');

const bankDetailSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    accountHolderName: {
        type: String,
        required: [true, 'Account holder name is required'],
        trim: true,
    },
    accountNumber: {
        type: String,
        required: [true, 'Account number is required'],
        trim: true,
    },
    ifscCode: {
        type: String,
        required: [true, 'IFSC code is required'],
        trim: true,
        uppercase: true,
    },
    isDefault: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('BankDetail', bankDetailSchema);
