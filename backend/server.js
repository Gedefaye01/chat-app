// server.js - Main application file for the backend

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const path = require('path'); // For handling file paths
const fs = require('fs'); // For file system operations
const jwt = require('jsonwebtoken'); // Import JWT for direct use in Socket.IO middleware

// Import models
const User = require('./models/User'); // User model
const Message = require('./models/Message'); // Message model

// Import middleware
const protect = require('./middleware/auth'); // JWT authentication middleware

// Load environment variables from .env file
dotenv.config();

// Import database connection function
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for development. In production, specify your frontend URL.
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8 // 100 MB limit for file uploads via Socket.IO
});

// Create 'uploads' directory and its subdirectories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const chatFilesDir = path.join(uploadsDir, 'chat_files');
const profilePicsDir = path.join(uploadsDir, 'profile_pics');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(chatFilesDir)) {
    fs.mkdirSync(chatFilesDir);
}
if (!fs.existsSync(profilePicsDir)) {
    fs.mkdirSync(profilePicsDir);
}

// Multer storage for chat files
const chatFileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, chatFilesDir); // Store chat files in 'uploads/chat_files/'
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const uploadChatFile = multer({ storage: chatFileStorage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB limit

// Multer storage for profile pictures
const profilePicStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profilePicsDir); // Store profile pics in 'uploads/profile_pics/'
    },
    filename: (req, file, cb) => {
        // Use user ID for profile pic filename to make it unique per user
        // req.user is set by the 'protect' middleware
        const userId = req.user ? req.user._id : 'guest';
        cb(null, `${userId}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadProfilePic = multer({
    storage: profilePicStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit for profile pics
    fileFilter: (req, file, cb) => {
        // Only allow images for profile pictures
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed for profile pictures!'), false);
        }
        cb(null, true);
    }
});


// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
app.use('/uploads', express.static(uploadsDir)); // Serve all uploads statically

// Request logging middleware (for debugging)
app.use((req, res, next) => {
    console.log(`Incoming Request: ${req.method} ${req.originalUrl}`);
    next();
});

// Routes
app.use('/api/auth', require('./routes/auth')); // Use auth routes
app.use('/api/messages', protect, require('./routes/messages')); // Protect message routes

// Route for chat file uploads (protected)
app.post('/api/upload', protect, uploadChatFile.single('chatFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    res.status(200).json({
        message: 'File uploaded successfully',
        filePath: `/uploads/chat_files/${req.file.filename}`,
        fileName: req.file.originalname,
        mimetype: req.file.mimetype
    });
});

// Route for profile picture uploads (protected)
app.post('/api/profile/upload-pic', protect, uploadProfilePic.single('profilePic'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No profile picture uploaded.' });
    }

    try {
        const user = await User.findById(req.user._id); // Get user from DB using ID from auth middleware
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Delete old profile picture if it exists and is not a default placeholder
        if (user.profilePicUrl && user.profilePicUrl.startsWith('/uploads/profile_pics/')) {
            const oldPath = path.join(__dirname, user.profilePicUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlink(oldPath, (err) => {
                    if (err) console.error('Error deleting old profile pic:', err);
                });
            }
        }

        user.profilePicUrl = `/uploads/profile_pics/${req.file.filename}`;
        await user.save();

        res.status(200).json({
            message: 'Profile picture updated successfully',
            profilePicUrl: user.profilePicUrl
        });
    } catch (error) {
        console.error('Error updating profile picture:', error);
        res.status(500).json({ message: 'Server error updating profile picture' });
    }
});


// Socket.IO authentication middleware
io.use(async (socket, next) => {
    console.log('Socket.IO: Attempting authentication...');
    if (socket.handshake.auth && socket.handshake.auth.token) {
        const token = socket.handshake.auth.token;
        console.log('Socket.IO: Token received:', token);
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Socket.IO: Token decoded:', decoded);
            socket.user = await User.findById(decoded.id).select('-password'); // Attach user to socket
            if (socket.user) {
                console.log('Socket.IO: User found and attached:', socket.user.username);
                next();
            } else {
                console.log('Socket.IO: User not found for decoded ID:', decoded.id);
                next(new Error('Authentication error: User not found'));
            }
        } catch (error) {
            console.error('Socket.IO auth error (JWT verification failed):', error.message);
            next(new Error('Authentication error: Token invalid or expired'));
        }
    } else {
        console.log('Socket.IO: No token provided in handshake.auth');
        next(new Error('Authentication error: No token provided'));
    }
});

// --- NEW: Online Users Tracking ---
// Map to store online users: { socketId: { username, profilePicUrl, currentRoom } }
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('A user connected via Socket.IO:', socket.id, 'Username:', socket.user ? socket.user.username : 'N/A');

    // Add user to online list and broadcast
    const userDetails = {
        username: socket.user.username,
        profilePicUrl: socket.user.profilePicUrl,
        socketId: socket.id // Store socket ID for direct messaging or specific actions
    };
    onlineUsers.set(socket.id, userDetails);

    // Emit the current list of online users to the newly connected user
    socket.emit('updateOnlineUsers', Array.from(onlineUsers.values()));

    // Broadcast that a new user has joined to everyone else (excluding the sender)
    socket.broadcast.emit('userJoined', userDetails);

    // Join a room
    socket.on('joinRoom', (roomName) => {
        // Leave previous rooms if any
        Array.from(socket.rooms).filter(r => r !== socket.id).forEach(r => socket.leave(r));
        socket.join(roomName);
        console.log(`${socket.user.username} (${socket.id}) joined room: ${roomName}`);

        // Update the user's current room in the onlineUsers map
        const user = onlineUsers.get(socket.id);
        if (user) {
            user.currentRoom = roomName;
            onlineUsers.set(socket.id, user); // Update the map
            // Broadcast the updated online users list to reflect room changes
            io.emit('updateOnlineUsers', Array.from(onlineUsers.values()));
        }

        // Announce user joining the room to the room itself
        io.to(roomName).emit('message', {
            user: 'System',
            text: `${socket.user.username} has joined the chat.`,
            timestamp: new Date().toISOString()
        });
    });

    // Handle incoming chat messages
    socket.on('chatMessage', async (msg) => {
        console.log('Message received via socket:', msg);
        try {
            // Create and save the message in the database
            const newMessage = await Message.create({
                sender: socket.user._id, // Use authenticated user's ID
                room: msg.room,
                text: msg.text,
                file: msg.file || null, // Ensure file is null if not provided
                replyTo: msg.replyTo || null // Ensure replyTo is null if not provided
            });

            // Populate the sender and replyTo fields for broadcasting
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'username profilePicUrl')
                .populate({
                    path: 'replyTo',
                    populate: {
                        path: 'sender',
                        select: 'username'
                    },
                    select: 'text file sender'
                });

            // Emit the populated message to all clients in the same room
            io.to(msg.room).emit('message', {
                _id: populatedMessage._id, // Include _id for reply functionality
                user: populatedMessage.sender.username,
                text: populatedMessage.text,
                file: populatedMessage.file,
                profilePicUrl: populatedMessage.sender.profilePicUrl,
                timestamp: populatedMessage.createdAt.toISOString(),
                room: populatedMessage.room,
                replyTo: populatedMessage.replyTo ? {
                    _id: populatedMessage.replyTo._id, // Include _id of replied message
                    text: populatedMessage.replyTo.text,
                    file: populatedMessage.replyTo.file,
                    sender: { username: populatedMessage.replyTo.sender.username } // Ensure sender is an object with username
                } : null
            });
        } catch (error) {
            console.error('Error saving or emitting message:', error);
            // Optionally, emit an error back to the sender
            socket.emit('messageError', { message: 'Failed to send message.' });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id, 'Username:', socket.user ? socket.user.username : 'N/A');
        const disconnectedUser = onlineUsers.get(socket.id);
        if (disconnectedUser) {
            onlineUsers.delete(socket.id);
            // Broadcast that a user has left to everyone
            io.emit('userLeft', disconnectedUser.username);
            // Also update the full list for everyone
            io.emit('updateOnlineUsers', Array.from(onlineUsers.values()));
        }
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
