const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Simple root endpoint
app.get('/', (req, res) => {
    res.json({ message: 'POD Gaming Backend API', version: '1.0.0' });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            message: 'POD Gaming Backend is running'
        };
        
        // Try to check database connection
        try {
            // Attempt a simple DB query to verify connection
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
                health.database = 'connected';
            } else {
                health.database = 'disconnected';
                health.databaseState = mongoose.connection.readyState;
            }
        } catch (dbError) {
            health.database = 'error';
            health.databaseError = dbError.message;
        }
        
        res.status(200).json(health);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Mount routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/player', require('./routes/player'));
app.use('/api/games', require('./routes/game'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/news', require('./routes/news'));
app.use('/api/admin', require('./routes/admin'));

// Error handler (must be after routes)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
