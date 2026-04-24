const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const admin = require('../../middleware/admin');
const upload = require('../../middleware/upload');
const ExcelImportRow = require('../../models/ExcelImport');
const { successResponse, errorResponse } = require('../../utils/helpers');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

router.use(auth, admin);

// Helper to normalise Excel column headers
const normalizeHeader = (h) => {
    if (!h) return '';
    return h.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Map normalised header -> model field
const COLUMN_MAP = {
    'payerreceiver': 'payerReceiver',
    'payer': 'payerReceiver',
    'paidvia': 'paidVia',
    'type': 'type',
    'creationtime': 'creationTime',
    'transactionid': 'transactionId',
    'transactio': 'transactionId',   // truncated header safety
    'transaction': 'transactionId',
    'amount': 'amount',
    'processingfee': 'processingFee',
    'processing': 'processingFee',
    'netamount': 'netAmount',
    'netamour': 'netAmount',         // truncated header safety
    'netamou': 'netAmount',
    'status': 'status',
    'updatetime': 'updateTime',
    'notes': 'notes',
};

// @route   POST /api/admin/import-transactions
// @desc    Import transactions from Excel (.xlsx / .xls) or CSV (.csv) file
router.post('/', upload.single('importFile'), async (req, res) => {
    try {
        if (!req.file) {
            return errorResponse(res, 'Please upload a valid file (.xlsx, .xls, or .csv)');
        }

        const filePath = req.file.path;
        const fileName = req.file.originalname;

        // Parse workbook
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to array of arrays to get raw header row
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length < 2) {
            return errorResponse(res, 'File is empty or has no data rows');
        }

        const headerRow = rawRows[0];
        const dataRows = rawRows.slice(1);

        // Map each raw header to its normalised column name
        const headerMap = headerRow.map(h => {
            const norm = normalizeHeader(String(h));
            return COLUMN_MAP[norm] || null;
        });

        const batchId = `batch_${Date.now()}`;
        const results = { success: 0, failed: 0, skipped: 0, errors: [] };
        const savedRows = [];

        for (let i = 0; i < dataRows.length; i++) {
            try {
                const row = dataRows[i];
                // Skip entirely blank rows
                if (row.every(cell => cell === '' || cell === null || cell === undefined)) {
                    continue;
                }

                const record = {
                    importBatch: batchId,
                    fileName,
                };

                headerMap.forEach((field, idx) => {
                    if (field) {
                        const raw = row[idx];
                        if (field === 'amount' || field === 'processingFee' || field === 'netAmount') {
                            record[field] = parseFloat(raw) || 0;
                        } else {
                            record[field] = raw !== undefined && raw !== null ? String(raw).trim() : '';
                        }
                    }
                });

                // Duplicate check
                if (record.transactionId && record.transactionId !== '') {
                    const exists = await ExcelImportRow.findOne({ transactionId: record.transactionId }).lean();
                    if (exists) {
                        results.skipped++;
                        continue;
                    }
                }

                const saved = await ExcelImportRow.create(record);
                savedRows.push(saved);
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Row ${i + 2}: ${err.message}`);
            }
        }

        // Cleanup uploaded file after processing
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

        return successResponse(res, {
            batchId,
            totalRows: dataRows.length,
            ...results,
            rows: savedRows,
        }, `Import complete: ${results.success} saved, ${results.failed} failed`);

    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/import-transactions
// @desc    Fetch all saved import rows (with optional batchId filter)
router.get('/', async (req, res) => {
    try {
        const { batchId, page = 1, limit = 50 } = req.query;
        const filter = batchId ? { importBatch: batchId } : {};
        const rows = await ExcelImportRow.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        const total = await ExcelImportRow.countDocuments(filter);
        return successResponse(res, { rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

// @route   GET /api/admin/import-transactions/export
// @desc    Fetch all saved import rows for export
router.get('/export', async (req, res) => {
    try {
        const rows = await ExcelImportRow.find({}).sort({ createdAt: -1 }).lean();
        return successResponse(res, rows);
    } catch (error) {
        errorResponse(res, error.message, 500);
    }
});

module.exports = router;
