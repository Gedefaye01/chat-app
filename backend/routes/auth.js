// routes/auth.js - Authentication Routes

const express = require('express');
const router = express.Router();
const { registerUser, authUser } = require('../controllers/authController'); // Correctly import authUser

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/auth/login
// @desc    Authenticate user
// @access  Public
router.post('/login', authUser); // <--- FIXED THIS LINE: Use authUser instead of loginUser

module.exports = router;
