const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const User = require('../models/User');
const KYC = require('../models/KYC');
const BankDetail = require('../models/BankDetail');
const Commission = require('../models/Commission');
const { successResponse, errorResponse } = require('../utils/helpers');

// @route   GET /api/player/profile
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('city', 'name');
        successResponse(res, user);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/player/profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { firstName, lastName, email } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { firstName, lastName, email },
            { new: true, runValidators: true }
        );
        successResponse(res, user, 'Profile updated');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/player/kyc
router.post('/kyc', auth, upload.fields([
    { name: 'panImage', maxCount: 1 },
    { name: 'aadhaarFrontImage', maxCount: 1 },
    { name: 'aadhaarBackImage', maxCount: 1 },
]), async (req, res) => {
    try {
        const { panNumber, aadhaarNumber } = req.body;

        let kyc = await KYC.findOne({ user: req.user._id });
        const kycData = {
            user: req.user._id,
            panNumber: panNumber || '',
            aadhaarNumber: aadhaarNumber || '',
            status: 'pending',
        };

        if (req.files) {
            if (req.files.panImage) kycData.panImage = req.files.panImage[0].path;
            if (req.files.aadhaarFrontImage) kycData.aadhaarFrontImage = req.files.aadhaarFrontImage[0].path;
            if (req.files.aadhaarBackImage) kycData.aadhaarBackImage = req.files.aadhaarBackImage[0].path;
        }

        if (kyc) {
            kyc = await KYC.findOneAndUpdate({ user: req.user._id }, kycData, { new: true });
        } else {
            kyc = await KYC.create(kycData);
        }

        successResponse(res, kyc, 'KYC submitted successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/player/kyc
router.get('/kyc', auth, async (req, res) => {
    try {
        const kyc = await KYC.findOne({ user: req.user._id });
        successResponse(res, kyc);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/player/bank-details
router.post('/bank-details', auth, async (req, res) => {
    try {
        const { accountHolderName, accountNumber, ifscCode } = req.body;

        let bank = await BankDetail.findOne({ user: req.user._id });
        if (bank) {
            bank = await BankDetail.findOneAndUpdate(
                { user: req.user._id },
                { accountHolderName, accountNumber, ifscCode },
                { new: true }
            );
        } else {
            bank = await BankDetail.create({
                user: req.user._id,
                accountHolderName,
                accountNumber,
                ifscCode,
            });
        }

        successResponse(res, bank, 'Bank details saved');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/player/bank-details
router.get('/bank-details', auth, async (req, res) => {
    try {
        const bank = await BankDetail.findOne({ user: req.user._id });
        successResponse(res, bank);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/player/referral
router.get('/referral', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const referredUsers = await User.find({ referredBy: req.user._id }).select('firstName lastName mobile createdAt');
        const totalCommission = await Commission.aggregate([
            { $match: { user: req.user._id } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        successResponse(res, {
            referralCode: user.referralCode,
            downlineCount: referredUsers.length,
            totalEarned: totalCommission.length > 0 ? totalCommission[0].total : 0,
            downlineUsers: referredUsers,
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
