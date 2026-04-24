const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const KYC = require('../../models/KYC');
const User = require('../../models/User');
const { successResponse, errorResponse } = require('../../utils/helpers');

router.use(auth, admin);

// @route   GET /api/admin/kyc
// @desc    Get all KYC requests
router.get('/', async (req, res) => {
    try {
        const { status = 'pending', page = 1, limit = 20, date } = req.query;
        const filter = status === 'all' ? {} : { status };
        if (date) {
            const [d, m, y] = date.split('-').map(Number);
            const start = new Date(y, m - 1, d);
            const end = new Date(y, m - 1, d + 1);
            filter.createdAt = { $gte: start, $lt: end };
        }

        const requests = await KYC.find(filter)
            .populate('user', 'firstName lastName mobile')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await KYC.countDocuments(filter);
        successResponse(res, { requests, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/kyc/:id/approve
// @desc    Approve a KYC request
router.put('/:id/approve', async (req, res) => {
    try {
        const kyc = await KYC.findById(req.params.id);
        if (!kyc) return errorResponse(res, 'KYC request not found', 404);
        if (kyc.status !== 'pending') return errorResponse(res, 'Already processed', 400);

        kyc.status = 'approved';
        kyc.verifiedBy = req.user._id;
        kyc.verifiedAt = Date.now();
        await kyc.save();

        await User.findByIdAndUpdate(kyc.user, { kycVerified: true });

        successResponse(res, kyc, 'KYC approved successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/kyc/:id/reject
// @desc    Reject a KYC request
router.put('/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        const kyc = await KYC.findById(req.params.id);
        if (!kyc) return errorResponse(res, 'KYC request not found', 404);
        if (kyc.status !== 'pending') return errorResponse(res, 'Already processed', 400);

        kyc.status = 'rejected';
        kyc.rejectReason = reason || 'Documents unclear or invalid';
        kyc.verifiedBy = req.user._id;
        kyc.verifiedAt = Date.now();
        await kyc.save();

        successResponse(res, kyc, 'KYC rejected');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
