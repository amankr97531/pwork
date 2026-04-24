const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const MoneyRequest = require('../models/MoneyRequest');
const Commission = require('../models/Commission');
const BankDetail = require('../models/BankDetail');
const UPI = require('../models/UPI');
const QRCode = require('qrcode');
const { successResponse, errorResponse } = require('../utils/helpers');

// @route   GET /api/wallet/balance
router.get('/balance', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        successResponse(res, { 
            balance: user.balance || 0,
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/wallet/transactions
router.get('/transactions', auth, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const transactions = await Transaction.find({ user: req.user._id })
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Transaction.countDocuments({ user: req.user._id });
        successResponse(res, { transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/wallet/add-money
router.post('/add-money', auth, async (req, res) => {
    try {
        const { amount, phoneNumber, source = 'ecuzen' } = req.body;
        if (!amount || amount <= 0) {
            return errorResponse(res, 'Valid amount is required');
        }

        const request = await MoneyRequest.create({
            user: req.user._id,
            type: 'add',
            source,
            amount,
            method: 'upi',
            phoneNumber: phoneNumber || '',
        });

        successResponse(res, request, 'Add money request submitted', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/wallet/withdraw
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { amount, source = 'ecuzen' } = req.body;
        if (!amount || amount <= 0) throw new Error('Valid amount is required');

        const user = await User.findById(req.user._id);
        if (user.balance < amount) throw new Error(`Insufficient balance`);

        const bank = await BankDetail.findOne({ user: req.user._id });
        if (!bank) throw new Error('Please add bank details first');

        const request = await MoneyRequest.create({
            user: req.user._id,
            type: 'withdraw',
            source,
            amount,
            method: 'bank_transfer',
            accountName: bank.accountHolderName,
            accountNumber: bank.accountNumber,
            ifscCode: bank.ifscCode,
        });

        // Hold the amount (deduct from unified balance)
        user.balance -= amount;
        await user.save();

        await Transaction.create({
            user: req.user._id,
            type: 'debit',
            category: 'withdraw',
            amount,
            description: `Withdraw Request (${source.toUpperCase()})`,
            status: 'pending',
        });

        successResponse(res, { request, newBalance: user.balance, source }, 'Withdraw request submitted successfully', 201);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/wallet/commission
router.get('/commission', auth, async (req, res) => {
    try {
        const commissions = await Commission.find({ user: req.user._id })
            .populate('referredUser', 'firstName lastName mobile')
            .sort('-createdAt');

        const totalEarned = commissions.reduce((sum, c) => sum + c.amount, 0);
        const pendingAmount = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);

        successResponse(res, {
            commissions,
            totalEarned,
            pendingAmount,
            downlineCount: commissions.length,
        });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   POST /api/wallet/withdraw-commission
router.post('/withdraw-commission', auth, async (req, res) => {
    try {
        const pendingCommissions = await Commission.find({ user: req.user._id, status: 'pending' });
        const totalPending = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);

        if (totalPending <= 0) {
            return errorResponse(res, 'No pending commission to withdraw');
        }

        // Mark as paid
        await Commission.updateMany({ user: req.user._id, status: 'pending' }, { status: 'paid' });

        // Already credited to balance during bet placement, so just record transaction
        await Transaction.create({
            user: req.user._id,
            type: 'credit',
            category: 'commission',
            amount: totalPending,
            description: 'Commission Withdrawal',
        });

        successResponse(res, { amount: totalPending }, 'Commission withdrawn');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/wallet/add-withdraw-status
router.get('/add-withdraw-status', auth, async (req, res) => {
    try {
        const { status } = req.query;
        const filter = { user: req.user._id };
        if (status) filter.status = status;

        const requests = await MoneyRequest.find(filter).sort('-createdAt');
        successResponse(res, requests);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/wallet/upi
router.get('/upi', auth, async (req, res) => {
    try {
        const upis = await UPI.find({ isActive: true });
        successResponse(res, upis);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/wallet/upi/:id/qr
router.get('/upi/:id/qr', auth, async (req, res) => {
    try {
        const { amount } = req.query;
        const upi = await UPI.findById(req.params.id);
        if (!upi) return errorResponse(res, 'UPI ID not found', 404);
        
        // Generate UPI URL: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=INR
        const name = upi.merchantName || 'POD Gaming';
        let upiString = `upi://pay?pa=${upi.upiId}&pn=${encodeURIComponent(name)}`;
        
        if (amount) {
            upiString += `&am=${amount}&cu=INR`;
        }
        
        const qrCodeDataUrl = await QRCode.toDataURL(upiString, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        successResponse(res, { qrCode: qrCodeDataUrl, upiString });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
