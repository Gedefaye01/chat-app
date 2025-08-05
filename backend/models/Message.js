// models/Message.js - Mongoose Message Schema

const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    room: {
        type: String, // Or mongoose.Schema.Types.ObjectId if you have room models
        required: true
    },
    text: {
        type: String,
        required: function() {
            // Text is required unless a file is present
            return !this.file || !this.file.filePath;
        },
        trim: true
    },
    file: { // Added for file uploads
        filePath: { type: String },
        fileName: { type: String },
        mimetype: { type: String }
    },
    replyTo: { // New field for reply functionality
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message', // Reference to another Message document
        default: null // Can be null if it's not a reply
    }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

module.exports = mongoose.model('Message', MessageSchema);
