// controllers/messageController.js - Message Handling Logic

const Message = require('../models/Message');
const User = require('../models/User'); // Import User model to get profilePicUrl

console.log('DEBUG: Loading controllers/messageController.js (With deleteMessages)'); // Diagnostic log

// @desc    Get messages for a specific room
// @route   GET /api/messages/:roomName
// @access  Private
const getMessages = async (req, res) => {
    // This log will only show if the function is successfully called
    console.log('DEBUG: getMessages function executed.');
    try {
        const messages = await Message.find({ room: req.params.roomName })
            .populate('sender', 'username profilePicUrl') // Populate sender's username and profilePicUrl
            .populate({ // Populate the replyTo message as well
                path: 'replyTo',
                populate: {
                    path: 'sender', // Populate the sender of the replied-to message
                    select: 'username' // Only get username for the replied-to sender
                },
                select: 'text file sender' // Select relevant fields for the replied-to message
            })
            .sort({ createdAt: 1 }); // Sort by creation time
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error fetching messages' });
    }
};

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
    // This log will only show if the function is successfully called
    console.log('DEBUG: sendMessage function executed.');
    const { room, text, file, replyTo } = req.body; // Added 'replyTo' to destructure
    const sender = req.user._id; // User ID from auth middleware

    if (!room || (!text && !file)) { // Message requires either text or a file
        return res.status(400).json({ message: 'Room and either text or file are required' });
    }

    try {
        const message = await Message.create({ sender, room, text, file, replyTo }); // Save replyTo ID
        // After saving, we might want to populate sender and replyTo for the response
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username profilePicUrl')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username'
                },
                select: 'text file sender'
            });

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Server error sending message' });
    }
};

// @desc    Delete multiple messages by ID
// @route   DELETE /api/messages
// @access  Private
const deleteMessages = async (req, res) => {
    console.log('DEBUG: deleteMessages function executed.');
    const { ids } = req.body; // Expects an array of message IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'No message IDs provided for deletion.' });
    }

    try {
        // Find messages to ensure they belong to the current user
        const messagesToDelete = await Message.find({ _id: { $in: ids } });

        const unauthorizedMessages = messagesToDelete.filter(msg => msg.sender.toString() !== req.user._id.toString());
        if (unauthorizedMessages.length > 0) {
            return res.status(403).json({ message: 'You are not authorized to delete all selected messages.' });
        }

        // Proceed with deletion only for messages owned by the user
        const result = await Message.deleteMany({ _id: { $in: ids }, sender: req.user._id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No messages found or authorized for deletion with provided IDs.' });
        }

        res.status(200).json({ message: `${result.deletedCount} message(s) deleted successfully.` });
    } catch (error) {
        console.error('Error deleting messages:', error);
        res.status(500).json({ message: 'Server error during message deletion.' });
    }
};

// Export all functions
module.exports = { getMessages, sendMessage, deleteMessages };
