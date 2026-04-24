const mongoose = require('mongoose');

// Stores each row imported from the Excel sheet
const excelImportRowSchema = new mongoose.Schema({
    payerReceiver: { type: String, default: '' },
    paidVia: { type: String, default: '' },
    type: { type: String, default: '' },
    creationTime: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    processingFee: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    status: { type: String, default: '' },
    updateTime: { type: String, default: '' },
    notes: { type: String, default: '' },
    importedAt: { type: Date, default: Date.now },
    importBatch: { type: String, default: '' }, // to group rows from the same upload
    fileName: { type: String, default: '' },
}, {
    timestamps: true,
});

module.exports = mongoose.model('ExcelImportRow', excelImportRowSchema);
