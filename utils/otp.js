// In-memory OTP store (use Redis in production)
const otpStore = new Map();

const generateOTP = (mobile) => {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(mobile, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });
    console.log('-------------------------------------------');
    console.log(`[OTP] Generated OTP: ${otp} for mobile: ${mobile}`);
    console.log('-------------------------------------------');
    return otp;
};

const verifyOTP = (mobile, otp) => {
    const stored = otpStore.get(mobile);
    if (!stored) return false;
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(mobile);
        return false;
    }
    if (stored.otp === otp) {
        otpStore.delete(mobile);
        return true;
    }
    return false;
};

module.exports = { generateOTP, verifyOTP };
