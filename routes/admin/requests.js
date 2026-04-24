const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const MoneyRequest = require('../../models/MoneyRequest');
const Commission = require('../../models/Commission');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { successResponse, errorResponse } = require('../../utils/helpers');

router.use(auth, admin);

// Helper to list requests with filters
const listRequests = async (req, res, filter) => {
    try {
        const { page = 1, limit = 20, status, search, date } = req.query;
        if (status) filter.status = status;
        if (date && typeof date === 'string' && date.includes('-')) {
            const [d, m, y] = date.split('-').map(Number);
            const start = new Date(y, m - 1, d);
            const end = new Date(y, m - 1, d + 1);
            filter.createdAt = { $gte: start, $lt: end };
        }

        const requests = await MoneyRequest.find(filter)
            .populate('user', 'firstName lastName mobile')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        // Fetch Bank Details for all users in one go
        const playerIds = requests.map(r => r.user?._id).filter(id => id);
        const BankDetail = require('../../models/BankDetail');
        const bankRecords = await BankDetail.find({ user: { $in: playerIds } }).lean();
        const bankMap = {};
        bankRecords.forEach(b => { if (b.user) bankMap[b.user.toString()] = b; });

        // Enrich with user totals (Add/Withdraw) and Bank Details
        const enriched = await Promise.all(requests.map(async (reqDoc) => {
            const reqObj = reqDoc.toObject();
            if (reqObj.user) {
                const addTotal = await Transaction.aggregate([
                    { $match: { user: reqObj.user._id, category: 'add_money', status: 'success' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]);
                const withdrawTotal = await Transaction.aggregate([
                    { $match: { user: reqObj.user._id, category: 'withdraw', status: 'success' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]);
                reqObj.user.totalAdd = addTotal[0]?.total || 0;
                reqObj.user.totalWithdraw = withdrawTotal[0]?.total || 0;
                reqObj.user.bankDetails = bankMap[reqObj.user._id.toString()] || null;
            }
            return reqObj;
        }));

        // Apply search on populated fields
        let filtered = enriched;
        if (search) {
            const lowerSearch = search.toLowerCase();
            filtered = enriched.filter(r =>
                r.user?.firstName?.toLowerCase().includes(lowerSearch) ||
                r.user?.lastName?.toLowerCase().includes(lowerSearch) ||
                r.user?.mobile?.includes(search)
            );
        }

        const total = await MoneyRequest.countDocuments(filter);
        const pendingCount = await MoneyRequest.countDocuments({ type: filter.type, status: 'pending' });
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        const todayAgg = await MoneyRequest.aggregate([
            { $match: { type: filter.type, createdAt: { $gte: new Date(startOfToday) } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const summary = {
            pendingCount,
            todayTotal: todayAgg[0]?.total || 0,
            successRate: 0 // Placeholder or actual calculation if needed
        };

        successResponse(res, { requests: filtered, total, summary, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('API listRequests ERROR:', error);
        errorResponse(res, error.message, 500);
    }
};

// @route   GET /api/admin/requests/add-money?source=ecuzen|pod|gsk (omit for all)
router.get('/add-money', (req, res) => {
    const filter = { type: 'add' };
    if (req.query.source && req.query.source !== 'all') {
        filter.source = req.query.source;
    }
    listRequests(req, res, filter);
});

// @route   GET /api/admin/requests/withdraw
router.get('/withdraw', (req, res) => listRequests(req, res, { type: 'withdraw' }));

// @route   GET /api/admin/requests/commission
router.get('/commission', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search, date } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (date && typeof date === 'string' && date.includes('-')) {
            const [d, m, y] = date.split('-').map(Number);
            const start = new Date(y, m - 1, d);
            const end = new Date(y, m - 1, d + 1);
            filter.createdAt = { $gte: start, $lt: end };
        }

        const commissions = await Commission.find(filter)
            .populate('user', 'firstName lastName mobile')
            .populate('referredUser', 'firstName lastName mobile')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        // Fetch Bank Details for agents
        const agentIds = commissions.map(c => c.user?._id).filter(id => id);
        const playerIds = commissions.map(c => c.referredUser?._id).filter(id => id);
        const allUserIds = [...new Set([...agentIds, ...playerIds])];
        
        const BankDetail = require('../../models/BankDetail');
        const bankRecords = await BankDetail.find({ user: { $in: allUserIds } }).lean();
        const bankMap = {};
        bankRecords.forEach(b => { if (b.user) bankMap[b.user.toString()] = b; });

        const enrichedCommissions = commissions.map(c => {
            const obj = c.toObject();
            if (obj.user) obj.user.bankDetails = bankMap[obj.user._id.toString()] || null;
            if (obj.referredUser) obj.referredUser.bankDetails = bankMap[obj.referredUser._id.toString()] || null;
            return obj;
        });

        // Apply search on populated fields
        let filtered = enrichedCommissions;
        if (search) {
            const lowerSearch = search.toLowerCase();
            filtered = enrichedCommissions.filter(c =>
                c.user?.firstName?.toLowerCase().includes(lowerSearch) ||
                c.user?.lastName?.toLowerCase().includes(lowerSearch) ||
                c.user?.mobile?.includes(search) ||
                c.referredUser?.firstName?.toLowerCase().includes(lowerSearch) ||
                c.referredUser?.mobile?.includes(search)
            );
        }

        const total = await Commission.countDocuments(filter);
        const pendingCount = await Commission.countDocuments({ status: 'pending' });
        const paidAgg = await Commission.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const summary = {
            pendingCount,
            paidToday: paidAgg[0]?.total || 0,
            totalCommissions: await Commission.countDocuments()
        };

        successResponse(res, { commissions: filtered, total, summary, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('API /admin/requests/commission ERROR:', error);
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/requests/:id/approve
router.put('/:id/approve', async (req, res) => {
    try {
        const request = await MoneyRequest.findById(req.params.id);
        if (!request) throw new Error('Request not found');
        if (request.status !== 'pending') throw new Error('Request already processed');

        request.status = 'approved';
        request.processedBy = req.user._id;
        await request.save();

        // Update player balance for add money
        if (request.type === 'add') {
            await User.findByIdAndUpdate(request.user, {
                $inc: { balance: request.amount },
            });

            await Transaction.create({
                user: request.user,
                type: 'credit',
                category: 'add_money',
                amount: request.amount,
                description: `Add Money Approved (${(request.source || 'N/A').toUpperCase()})`,
            });
        } else {
            // For withdraw, money was already deducted (held) from balance, 
            // just update transaction record status to success.
            await Transaction.findOneAndUpdate(
                { user: request.user, category: 'withdraw', status: 'pending' },
                { status: 'success' },
                { sort: { createdAt: -1 } }
            );
        }

        successResponse(res, request, 'Request approved successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/requests/:id/reject
router.put('/:id/reject', async (req, res) => {
    try {
        const request = await MoneyRequest.findById(req.params.id);
        if (!request) throw new Error('Request not found');
        if (request.status !== 'pending') throw new Error('Request already processed');

        request.status = 'rejected';
        request.processedBy = req.user._id;
        await request.save();

        // Refund balance for rejected withdrawals
        if (request.type === 'withdraw') {
            await User.findByIdAndUpdate(request.user, {
                $inc: { balance: request.amount },
            });

            await Transaction.findOneAndUpdate(
                { user: request.user, category: 'withdraw', status: 'pending' },
                { status: 'rejected' },
                { sort: { createdAt: -1 } }
            );
        }

        successResponse(res, request, 'Request rejected successfully');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   PUT /api/admin/requests/commission/:id/pay
// @desc    Mark commission as paid (Record-keeping only, balance is credited instantly at bet placement)
router.put('/commission/:id/pay', async (req, res) => {
    try {
        const commission = await Commission.findById(req.params.id);
        if (!commission) return errorResponse(res, 'Commission request not found', 404);
        if (commission.status === 'paid') return errorResponse(res, 'Commission already paid');

        // NOTE: we DON'T increment user.balance here because the commission is
        // already credited to the user's balance instantly in game.js when the bet is placed.
        // This route simply marks it as 'Paid' in the admin dashboard for record-keeping.
        
        commission.status = 'paid';
        await commission.save();

        successResponse(res, commission, 'Commission marked as paid (Balance already credited at bet placement)');
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
