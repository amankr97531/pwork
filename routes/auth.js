const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateOTP, verifyOTP } = require('../utils/otp');
const { successResponse, errorResponse } = require('../utils/helpers');
const auth = require('../middleware/auth');

// Helper: generate tokens
const generateTokens = async (user) => {
    const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30m',
    });
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Store refresh token and update last login
    await User.findByIdAndUpdate(user._id, { 
        refreshToken,
        lastLogin: new Date()
    });

    return { accessToken, refreshToken };
};

// @route   POST /api/auth/signup
// @desc    Register a new player
router.post('/signup', [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(res, errors.array()[0].msg);
        }

        const { firstName, lastName, mobile, password, referralId } = req.body;

        let user = await User.findOne({ mobile });
        if (user) {
            return errorResponse(res, 'Mobile number already registered');
        }

        let referredBy = null;
        if (referralId) {
            const referrer = await User.findOne({ referralCode: referralId });
            if (referrer) {
                referredBy = referrer._id;
            }
        }

        user = await User.create({
            firstName,
            lastName,
            mobile,
            password,
            referredBy,
        });

        const otp = generateOTP(mobile);
        successResponse(res, { mobile, otp }, 'Registration successful. Please verify OTP.', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/login
// @desc    Login with mobile + password, returns OTP
router.post('/login', [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(res, errors.array()[0].msg);
        }

        const { mobile, password } = req.body;

        const user = await User.findOne({ mobile }).select('+password');
        if (!user) {
            return errorResponse(res, 'Invalid mobile number or password', 401);
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return errorResponse(res, 'Invalid mobile number or password', 401);
        }

        if (user.status === 'blocked') {
            return errorResponse(res, 'Your account has been blocked', 403);
        }

        const otp = generateOTP(mobile);
        successResponse(res, { mobile, otp }, 'OTP sent to your mobile number');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and return JWT token + refresh token
router.post('/verify-otp', [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(res, errors.array()[0].msg);
        }

        const { mobile, otp } = req.body;

        if (!verifyOTP(mobile, otp)) {
            return errorResponse(res, 'Invalid or expired OTP', 401);
        }

        const user = await User.findOne({ mobile });
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        const tokens = await generateTokens(user);

        successResponse(res, {
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                balance: user.balance,
                role: user.role,
                referralCode: user.referralCode,
            },
        }, 'Login successful');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
], async (req, res) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ mobile });
        if (!user) {
            return errorResponse(res, 'No account found with this mobile number', 404);
        }

        const otp = generateOTP(mobile);
        successResponse(res, { mobile, otp }, 'OTP sent for password reset');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/reset-password
router.post('/reset-password', [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(res, errors.array()[0].msg);
        }

        const { mobile, otp, newPassword } = req.body;

        if (!verifyOTP(mobile, otp)) {
            return errorResponse(res, 'Invalid or expired OTP', 401);
        }

        const user = await User.findOne({ mobile }).select('+password');
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        user.password = newPassword;
        await user.save();

        successResponse(res, null, 'Password reset successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/auth/change-password
router.put('/change-password', auth, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(res, errors.array()[0].msg);
        }

        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user._id).select('+password');
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return errorResponse(res, 'Current password is incorrect', 401);
        }

        user.password = newPassword;
        await user.save();

        successResponse(res, null, 'Password changed successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/admin/login
router.post('/admin/login', [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return errorResponse(res, errors.array()[0].msg);
        }

        const { mobile, password } = req.body;

        const user = await User.findOne({ mobile, role: 'admin' }).select('+password');
        if (!user) {
            return errorResponse(res, 'Invalid admin credentials', 401);
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return errorResponse(res, 'Invalid admin credentials', 401);
        }

        const otp = generateOTP(mobile);
        successResponse(res, { mobile, otp }, 'Admin OTP sent');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/admin/verify-otp
// @desc    Admin OTP verify — returns JWT + refresh token
router.post('/admin/verify-otp', [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
], async (req, res) => {
    try {
        const { mobile, otp } = req.body;

        if (!verifyOTP(mobile, otp)) {
            return errorResponse(res, 'Invalid or expired OTP', 401);
        }

        const user = await User.findOne({ mobile, role: 'admin' });
        if (!user) {
            return errorResponse(res, 'Admin not found', 404);
        }

        const tokens = await generateTokens(user);

        successResponse(res, {
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user._id,
                name: user.name,
                mobile: user.mobile,
                role: user.role,
            },
        }, 'Admin login successful');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token using refresh token
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return errorResponse(res, 'Refresh token is required', 401);
        }

        const user = await User.findOne({ refreshToken }).select('+refreshToken');
        if (!user) {
            return errorResponse(res, 'Invalid refresh token', 401);
        }

        const tokens = await generateTokens(user);

        successResponse(res, {
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        }, 'Token refreshed successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/auth/validate
// @desc    Validate current token and return user info
router.get('/validate', auth, async (req, res) => {
    try {
        successResponse(res, {
            valid: true,
            user: {
                id: req.user._id,
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                name: req.user.name,
                mobile: req.user.mobile,
                email: req.user.email,
                role: req.user.role,
                balanceEcuzen: req.user.balanceEcuzen,
                balancePOD: req.user.balancePOD,
                balanceGSK: req.user.balanceGSK,
                referralCode: req.user.referralCode,
            },
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/auth/logout
// @desc    Clear refresh token (server-side logout)
router.post('/logout', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { refreshToken: '' });
        successResponse(res, null, 'Logged out successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
