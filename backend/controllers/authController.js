// controllers/authController.js - Authentication Logic

const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '1h', // Token expires in 1 hour
    });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
        return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Check for existing user
    const userExists = await User.findOne({ username });
    if (userExists) {
        return res.status(400).json({ message: 'User already exists' });
    }

    // Create user
    try {
        const user = await User.create({ username, password });
        res.status(201).json({
            _id: user._id,
            username: user.username,
            profilePicUrl: user.profilePicUrl, // Include profilePicUrl
            token: generateToken(user._id),
        });
    } catch (error) {
        console.error('Registration error:', error); // Log the actual error
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
    const { username, password } = req.body;

    // Check for user
    try {
        const user = await User.findOne({ username });

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                username: user.username,
                profilePicUrl: user.profilePicUrl, // Include profilePicUrl
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error); // Log the actual error
        res.status(500).json({ message: 'Server error during login' });
    }
};

module.exports = { registerUser, authUser };
