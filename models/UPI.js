const mongoose = require('mongoose');

const upiSchema = new mongoose.Schema({
    upiId: {
        type: String,
        required: [true, 'UPI ID is required'],
        trim: true,
    },
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
    },
    qrImage: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('UPI', upiSchema);
