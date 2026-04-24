const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
    },
    mobile: {
        type: String,
        required: [true, 'Mobile number is required'],
        unique: true,
        trim: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false,
    },
    role: {
        type: String,
        enum: ['player', 'admin'],
        default: 'player',
    },
    balance: {
        type: Number,
        default: 0,
    },
    refreshToken: {
        type: String,
        default: '',
        select: false,
    },
    fcmToken: {
        type: String,
        default: '',
    },
    kycVerified: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active',
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true,
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    city: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
    },
    lastLogin: {
        type: Date,
    },
    profileImage: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
});

// Hash password before save
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate referral code before save
userSchema.pre('save', function (next) {
    if (!this.referralCode) {
        this.referralCode = 'POD' + Math.random().toString(36).substring(2, 7).toUpperCase();
    }
    next();
});

// Virtual for full name
userSchema.virtual('name').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
