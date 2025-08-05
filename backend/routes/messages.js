// routes/messages.js - Message Routes

const express = require('express');
const router = express.Router();

console.log('DEBUG: Loading routes/messages.js (With DELETE Route)'); // Diagnostic log

// Import the messageController functions, including deleteMessages
const { getMessages, sendMessage, deleteMessages } = require('../controllers/messageController');

// Import the protect middleware
const protect = require('../middleware/auth');

// Get messages for a specific room (requires authentication)
router.get('/:roomName', protect, getMessages);

// Send a message (requires authentication)
router.post('/', protect, sendMessage);

// NEW: Route to delete messages (requires authentication)
router.delete('/', protect, deleteMessages);

module.exports = router;
