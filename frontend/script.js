// script.js - Frontend logic for the chat application with UI enhancements, file upload, and scroll-up button

//const backendUrl = 'http://localhost:5000'; // Make sure this matches your backend URL
const backendUrl = 'https://chat-app-xcjr.onrender.com';

// DOM Elements
const authSection = document.getElementById('auth-section');
const chatSection = document.getElementById('chat-section');
const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const registerBtn = document.getElementById('register-btn');
const loginBtn = document.getElementById('login-btn');
const authMessage = document.getElementById('auth-message'); // For messages specific to auth section

const currentRoomDisplay = document.getElementById('current-room-display');
const roomSelect = document.getElementById('room-select');
const joinRoomBtn = document.getElementById('join-room-btn');
const messagesBox = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn'); // Moved to header

// New profile picture elements
const headerProfilePic = document.getElementById('header-profile-pic');
const headerUsername = document.getElementById('header-username');
const uploadProfilePicBtn = document.getElementById('upload-profile-pic-btn');
const profilePicInput = document.getElementById('profile-pic-input');

// Notification message element (will be created dynamically)
let notificationMessageDiv;

// Reply functionality elements
const replyToContainer = document.getElementById('reply-to-container');
const replyToText = document.getElementById('reply-to-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');
let replyingToMessageId = null; // Stores the _id of the message being replied to

let currentUser = null;
let currentToken = null;
let currentRoom = roomSelect.value; // Default room
let socket = null; // Socket.IO instance

let scrollToTopBtn; // Declare the scroll-to-top button globally

// --- Message Selection and Deletion ---
const selectedMessages = new Set(); // Stores IDs of selected messages
let deleteSelectedBtn; // Button for deleting selected messages
let cancelSelectionBtn; // Button for canceling selection

// --- Theme Toggle ---
let themeToggleBtn; // Button for toggling theme

// --- Online Users Display ---
const onlineUsersList = document.getElementById('online-users-list');
// NEW: DOM elements for online users sidebar and its toggle
const onlineUsersSidebar = document.getElementById('online-users-sidebar');
const toggleOnlineUsersBtn = document.getElementById('toggle-online-users-btn');


// --- Utility Functions ---

function showSection(section) {
    authSection.classList.add('hidden');
    chatSection.classList.add('hidden');
    section.classList.remove('hidden');
    // Hide scroll-to-top button when not in chat section
    if (scrollToTopBtn) {
        scrollToTopBtn.classList.remove('show');
    }
}

// Function to update header profile info
function updateHeaderProfile(username, profilePicUrl) {
    headerUsername.textContent = username;
    // Ensure the profilePicUrl is a full URL
    headerProfilePic.src = profilePicUrl ? `${backendUrl}${profilePicUrl}` : 'https://placehold.co/40x40/cccccc/ffffff?text=P'; // Default if no pic
}

// Function to display non-blocking notifications
function showNotification(message, type = 'info', duration = 3000) {
    if (!notificationMessageDiv) {
        notificationMessageDiv = document.createElement('div');
        notificationMessageDiv.id = 'notification-message';
        document.body.appendChild(notificationMessageDiv);
    }

    notificationMessageDiv.textContent = message;
    notificationMessageDiv.className = ''; // Clear previous classes
    notificationMessageDiv.classList.add(type);
    notificationMessageDiv.classList.add('show');

    setTimeout(() => {
        notificationMessageDiv.classList.remove('show');
    }, duration);
}


function displayMessage(msgData, isSystem = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (isSystem) {
        messageElement.classList.add('system');
    }

    // Attach message ID for reply and selection functionality
    if (msgData._id) {
        messageElement.dataset.messageId = msgData._id;
    }

    const date = new Date(msgData.timestamp || msgData.createdAt);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    let profilePicHtml = '';
    // Safely access user and profilePicUrl, handling cases where sender might not be populated
    const user = msgData.user || (msgData.sender && msgData.sender.username ? msgData.sender.username : 'Unknown');
    const profilePicUrl = msgData.profilePicUrl || (msgData.sender && msgData.sender.profilePicUrl ? msgData.sender.profilePicUrl : null);

    if (!isSystem) { // System messages don't have profile pics
        const picSrc = profilePicUrl ? `${backendUrl}${profilePicUrl}` : 'https://placehold.co/30x30/cccccc/ffffff?text=P';
        profilePicHtml = `<img src="${picSrc}" alt="${user}" class="message-profile-pic">`;
    }

    let messageContentHtml = `<div class="message-content">`;

    // Add reply-to content if available
    if (msgData.replyTo) {
        // Safely access repliedToSender username
        const repliedToSender = msgData.replyTo.sender && msgData.replyTo.sender.username ? msgData.replyTo.sender.username : 'Unknown';
        const repliedToContent = msgData.replyTo.text || (msgData.replyTo.file ? `[File: ${msgData.replyTo.file.fileName}]` : '[No Text]');
        messageContentHtml += `
            <div class="reply-preview">
                Replying to <strong>${repliedToSender}</strong>:
                <span class="replied-text">${repliedToContent}</span>
            </div>
        `;
    }

    messageContentHtml += `<strong>${user}:</strong> `;

    if (msgData.text) {
        messageContentHtml += `${msgData.text} `;
    }

    if (msgData.file && msgData.file.filePath && msgData.file.fileName) {
        const fileUrl = `${backendUrl}${msgData.file.filePath}`;
        if (msgData.file.mimetype && msgData.file.mimetype.startsWith('image/')) {
            messageContentHtml += `<br><img src="${fileUrl}" alt="${msgData.file.fileName}" class="chat-image">`;
        } else {
            messageContentHtml += `<br><a href="${fileUrl}" target="_blank" class="chat-file-link">📁 ${msgData.file.fileName}</a>`;
        }
    }

    messageContentHtml += `<span class="timestamp">${timeString}</span></div>`;

    messageElement.innerHTML = profilePicHtml + messageContentHtml;
    messagesBox.appendChild(messageElement);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    // Add event listener for replying (right-click)
    if (!isSystem) {
        messageElement.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Prevent default right-click menu
            startReply(msgData);
        });
        // New: Add click listener for message selection
        messageElement.addEventListener('click', (e) => {
            // Prevent selection if clicking on a link or image within the message
            if (e.target.tagName === 'A' || e.target.tagName === 'IMG') {
                return;
            }
            toggleMessageSelection(messageElement, msgData);
        });
    }
}


function clearMessages() {
    messagesBox.innerHTML = '';
    selectedMessages.clear(); // Clear selection when clearing messages
    updateDeleteButtonState(); // Call this to update the button visibility
}

function setAuthMessage(msg, type = 'info') {
    authMessage.textContent = msg;
    authMessage.style.color = type === 'error' ? '#dc3545' : '#28a745';
    authMessage.style.fontWeight = 'bold';
    authMessage.style.marginTop = '10px';
}

// --- Authentication Functions ---

async function registerUser() {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();

    if (!username || !password) {
        setAuthMessage('Please enter both username and password.', 'error');
        return;
    }

    try {
        const response = await fetch(`${backendUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            setAuthMessage('Registration successful! Please log in.', 'info');
            showNotification('Registration successful! You can now log in.', 'success');
            authUsernameInput.value = '';
            authPasswordInput.value = '';
        } else {
            setAuthMessage(data.message || 'Registration failed.', 'error');
            showNotification(data.message || 'Registration failed.', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        setAuthMessage('Network error during registration. Is the backend running?', 'error');
        showNotification('Network error during registration. Is the backend running?', 'error');
    }
}

async function loginUser() {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();

    if (!username || !password) {
        setAuthMessage('Please enter both username and password.', 'error');
        return;
    }

    try {
        const response = await fetch(`${backendUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = username;
            currentToken = data.token;
            localStorage.setItem('chatAppToken', currentToken);
            localStorage.setItem('chatAppUser', currentUser);
            localStorage.setItem('chatAppProfilePic', data.profilePicUrl || ''); // Store profile pic URL
            setAuthMessage('Login successful!', 'info');
            showNotification('Login successful!', 'success');
            showChatSection();
            authUsernameInput.value = '';
            authPasswordInput.value = '';
            logoutBtn.classList.remove('hidden'); // Show logout button
        } else {
            setAuthMessage(data.message || 'Login failed. Invalid credentials.', 'error');
            showNotification(data.message || 'Login failed. Invalid credentials.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        setAuthMessage('Network error during login. Is the backend running?', 'error');
        showNotification('Network error during login. Is the backend running?', 'error');
    }
}

function logoutUser() {
    console.log('logoutUser() function called.'); // Added for debugging
    currentUser = null;
    currentToken = null;
    localStorage.removeItem('chatAppToken');
    localStorage.removeItem('chatAppUser');
    localStorage.removeItem('chatAppProfilePic'); // Clear profile pic on logout
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    clearMessages(); // This will now safely call updateDeleteButtonState()
    clearActiveUsersList(); // NEW: Clear active users on logout
    showSection(authSection);
    setAuthMessage('');
    authUsernameInput.value = '';
    authPasswordInput.value = '';
    updateHeaderProfile('Guest', null); // Reset header profile
    logoutBtn.classList.add('hidden'); // Hide logout button
    showNotification('You have been logged out.', 'info');
    cancelReply(); // Clear any active reply
}

// --- Chat Functions ---

async function showChatSection() {
    showSection(chatSection);
    currentRoomDisplay.textContent = currentRoom;
    connectSocket();
    await fetchMessages(currentRoom);
    messageInput.focus();
    toggleScrollToTopButton();
    updateHeaderProfile(currentUser, localStorage.getItem('chatAppProfilePic')); // Update header on chat entry
    logoutBtn.classList.remove('hidden'); // Ensure logout button is visible when chat section is shown

    // Create and append the delete button if it doesn't exist
    if (!deleteSelectedBtn) {
        deleteSelectedBtn = document.createElement('button');
        deleteSelectedBtn.id = 'delete-selected-btn';
        deleteSelectedBtn.textContent = 'Delete Selected';
        deleteSelectedBtn.classList.add('hidden'); // Hidden by default
        deleteSelectedBtn.addEventListener('click', deleteSelectedMessages);
        // Find a good place to append it, e.g., next to the send button or in a new control area
        // Create a container for action buttons if it doesn't exist
        let actionButtonsContainer = document.getElementById('chat-action-buttons');
        if (!actionButtonsContainer) {
            actionButtonsContainer = document.createElement('div');
            actionButtonsContainer.id = 'chat-action-buttons';
            actionButtonsContainer.style.display = 'flex';
            actionButtonsContainer.style.gap = '10px';
            actionButtonsContainer.style.marginTop = '10px';
            actionButtonsContainer.style.justifyContent = 'center'; // Center the buttons
            // Insert it before the message input container
            messageInput.parentNode.parentNode.insertBefore(actionButtonsContainer, messageInput.parentNode.nextSibling);
        }
        actionButtonsContainer.appendChild(deleteSelectedBtn);
    }

    // Create and append the cancel selection button if it doesn't exist
    if (!cancelSelectionBtn) {
        cancelSelectionBtn = document.createElement('button');
        cancelSelectionBtn.id = 'cancel-selection-btn';
        cancelSelectionBtn.textContent = 'Cancel Selection';
        cancelSelectionBtn.classList.add('hidden'); // Hidden by default
        cancelSelectionBtn.addEventListener('click', cancelSelection);
        // Append it next to the delete button
        deleteSelectedBtn.parentNode.insertBefore(cancelSelectionBtn, deleteSelectedBtn.nextSibling);
    }

    // NEW: Create and append the theme toggle button if it doesn't exist
    if (!themeToggleBtn) {
        themeToggleBtn = document.createElement('button');
        themeToggleBtn.id = 'theme-toggle-btn';
        themeToggleBtn.innerHTML = '&#9728; Light / &#9790; Dark'; // Sun/Moon icons
        themeToggleBtn.addEventListener('click', toggleTheme);
        // Append it to the header, specifically to the .header-controls div
        const headerControls = document.querySelector('.header-controls');
        if (headerControls) {
            headerControls.insertBefore(themeToggleBtn, logoutBtn); // Insert before logout button
        } else {
            // Fallback if .header-controls not found (should be in index.html)
            logoutBtn.parentNode.insertBefore(themeToggleBtn, logoutBtn.nextSibling);
        }
    }

    // NEW: Add event listener for the online users sidebar toggle button
    if (toggleOnlineUsersBtn) {
        toggleOnlineUsersBtn.addEventListener('click', () => {
            onlineUsersSidebar.classList.toggle('minimized');
            if (onlineUsersSidebar.classList.contains('minimized')) {
                toggleOnlineUsersBtn.innerHTML = '&gt;'; // Point right when minimized
                showNotification('Online users sidebar minimized.', 'info', 1000);
            } else {
                toggleOnlineUsersBtn.innerHTML = '&lt;'; // Point left when expanded
                showNotification('Online users sidebar expanded.', 'info', 1000);
            }
        });
        // Set initial button state based on default minimized class in HTML
        if (onlineUsersSidebar.classList.contains('minimized')) {
            toggleOnlineUsersBtn.innerHTML = '&gt;';
        } else {
            toggleOnlineUsersBtn.innerHTML = '&lt;';
        }
    }

    updateDeleteButtonState(); // Initialize button state
}

function connectSocket() {
    if (socket) {
        socket.disconnect();
    }
    socket = io(backendUrl, {
        auth: {
            token: currentToken
        },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to Socket.IO server');
        socket.emit('joinRoom', currentRoom);
    });

    socket.on('message', (msg) => {
        // Pass the full message object to displayMessage
        displayMessage(msg);
    });

    // NEW: Socket.IO events for user presence
    socket.on('currentRoomUsers', (users) => {
        console.log('Received currentRoomUsers:', users);
        displayActiveUsers(users);
    });

    socket.on('userJoined', (user) => {
        console.log('User joined:', user);
        // Check if the user is already in the list (e.g., if they reconnected)
        const existingUserElement = onlineUsersList.querySelector(`li[data-username="${user.username}"]`);
        if (!existingUserElement) {
            addActiveUserToList(user);
            showNotification(`${user.username} has joined the room.`, 'info', 2000);
        } else {
            // Update existing user's status if needed (e.g., if they were marked as away)
            const statusIndicator = existingUserElement.querySelector('.online-indicator');
            if (statusIndicator) statusIndicator.classList.add('online');
        }
        // No need to call updateActiveUsersCount here, as displayActiveUsers handles it on full list update
    });

    socket.on('userLeft', (user) => {
        console.log('User left:', user);
        removeActiveUserFromList(user);
        showNotification(`${user.username} has left the room.`, 'info', 2000);
        // No need to call updateActiveUsersCount here, as displayActiveUsers handles it on full list update
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO server');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err.message);
        if (err.message === 'Authentication error' || err.message.includes('Not authorized')) {
            showNotification('Authentication failed. Please log in again.', 'error');
            logoutUser(); // <--- This is the line that triggers the logout message
        } else {
            setAuthMessage('Could not connect to chat server. Please check backend.', 'error');
            showNotification('Could not connect to chat server. Please check backend.', 'error');
        }
    });
}

async function fetchMessages(room) {
    clearMessages();
    displayMessage({ user: 'System', text: `Loading messages for ${room}...`, timestamp: new Date().toISOString() }, true);
    try {
        const response = await fetch(`${backendUrl}/api/messages/${room}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const data = await response.json();
        console.log('Received data from backend for messages:', data); // Log received data

        if (response.ok) {
            clearMessages(); // Clear "Loading messages..."
            if (Array.isArray(data)) { // <--- Added check if data is an array
                if (data.length === 0) {
                    displayMessage({ user: 'System', text: `No messages yet in ${room}. Be the first to say hi!`, timestamp: new Date().toISOString() }, true);
                } else {
                    data.forEach(msg => {
                        displayMessage(msg); // Pass the full message object
                    });
                }
            } else {
                console.error('Expected array of messages but received:', data);
                displayMessage({ user: 'System', text: `Error: Received unexpected data format for messages.`, timestamp: new Date().toISOString() }, true);
                showNotification(`Error: Received unexpected data format for messages.`, 'error');
            }
        } else {
            console.error('Failed to fetch messages:', data.message);
            displayMessage({ user: 'System', text: `Failed to load messages for ${room}.`, timestamp: new Date().toISOString() }, true);
            showNotification(`Failed to load messages for ${room}.`, 'error');
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
        displayMessage({ user: 'System', text: 'Network error fetching messages.', timestamp: new Date().toISOString() }, true);
        showNotification('Network error fetching messages.', 'error');
    }
}

async function sendMessage() {
    const text = messageInput.value.trim();
    const file = fileInput.files[0];

    if (!text && !file) {
        return;
    }

    let fileInfo = null;

    if (file) {
        const formData = new FormData();
        formData.append('chatFile', file);

        try {
            const uploadResponse = await fetch(`${backendUrl}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                },
                body: formData
            });
            const uploadData = await uploadResponse.json();

            if (uploadResponse.ok) {
                fileInfo = {
                    filePath: uploadData.filePath,
                    fileName: uploadData.fileName,
                    mimetype: uploadData.mimetype
                };
                showNotification(`File "${fileInfo.fileName}" uploaded.`, 'info'); // Notification for file upload
            } else {
                console.error('File upload failed:', uploadData.message);
                showNotification(`File upload failed: ${uploadData.message || 'Unknown error'}`, 'error');
                return;
            }
        } catch (error) {
            console.error('Network error during file upload:', error);
            showNotification('Network error during file upload.', 'error');
            return;
        }
    }

    // Prepare message data, including replyTo if active
    const messageData = {
        user: currentUser,
        text: text,
        room: currentRoom,
        file: fileInfo,
        profilePicUrl: localStorage.getItem('chatAppProfilePic'), // Get current user's profile pic URL
        replyTo: replyingToMessageId // Include the ID of the message being replied to
    };

    if (socket && socket.connected) {
        socket.emit('chatMessage', messageData);
    } else {
        console.warn('Socket not connected, attempting to send message/file info via HTTP API.');
        try {
            const response = await fetch(`${backendUrl}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify(messageData) // Send the full messageData object
            });
            const data = await response.json();
            if (response.ok) {
                displayMessage(data); // Display the message returned by the API (which should be populated)
                showNotification('Message sent!', 'success', 1500); // Short notification for message sent
            } else {
                console.error('Failed to send message via HTTP:', data.message);
                showNotification('Failed to send message.', 'error');
            }
        } catch (error) {
            console.error('Network error sending message via HTTP:', error);
            showNotification('Network error sending message.', 'error');
        }
    }

    messageInput.value = '';
    fileInput.value = '';
    messageInput.focus();
    cancelReply(); // Clear reply context after sending
}

// --- Profile Picture Upload Function ---
async function uploadProfilePicture() {
    const file = profilePicInput.files[0];
    if (!file) {
        showNotification('Please select a profile picture to upload.', 'info');
        return;
    }

    const formData = new FormData();
    formData.append('profilePic', file); // 'profilePic' must match multer field name in backend for profile pics

    try {
        const response = await fetch(`${backendUrl}/api/profile/upload-pic`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });
        const data = await response.json();

        if (response.ok) {
            const newProfilePicUrl = data.profilePicUrl;
            localStorage.setItem('chatAppProfilePic', newProfilePicUrl); // Update local storage
            updateHeaderProfile(currentUser, newProfilePicUrl); // Update header
            showNotification('Profile picture uploaded successfully!', 'success');
        } else {
            showNotification(`Profile picture upload failed: ${data.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showNotification('Network error during profile picture upload.', 'error');
    } finally {
        profilePicInput.value = ''; // Clear file input
    }
}

// --- Reply Functionality ---
function startReply(messageData) {
    replyingToMessageId = messageData._id;
    const repliedToSender = messageData.user || (messageData.sender && messageData.sender.username ? messageData.sender.username : 'Unknown');
    const repliedToContent = messageData.text || (messageData.file ? `[File: ${messageData.file.fileName}]` : '[No Text]'); // Corrected msgData.file reference
    replyToText.innerHTML = `Replying to <strong>${repliedToSender}</strong>: ${repliedToContent}`;
    replyToContainer.classList.remove('hidden');
    messageInput.focus();
}

function cancelReply() {
    replyingToMessageId = null;
    replyToText.textContent = '';
    replyToContainer.classList.add('hidden');
}


// --- Scroll-to-Top Button Functions ---

function createScrollToTopButton() {
    scrollToTopBtn = document.createElement('button');
    scrollToTopBtn.classList.add('scroll-to-top-btn');
    scrollToTopBtn.innerHTML = '&uarr;'; // Up arrow character
    document.body.appendChild(scrollToTopBtn);

    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Smooth scroll to top
        });
    });

    // Event listener to show/hide button on scroll
    window.addEventListener('scroll', toggleScrollToTopButton);
}

function toggleScrollToTopButton() {
    // Only show button if chat section is visible AND user is scrolled down
    if (chatSection.classList.contains('hidden')) {
        scrollToTopBtn.classList.remove('show');
        return;
    }
    if (window.scrollY > 200) { // Show button if scrolled more than 200px
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
}

// --- Message Selection Functions ---
function toggleMessageSelection(messageElement, msgData) {
    const messageId = msgData._id;
    if (!messageId) return; // Cannot select messages without an ID

    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
        messageElement.classList.remove('selected-message');
    } else {
        selectedMessages.add(messageId);
        messageElement.classList.add('selected-message');
    }
    updateDeleteButtonState();
}

function updateDeleteButtonState() {
    // Check if buttons have been initialized before accessing their properties
    if (deleteSelectedBtn && cancelSelectionBtn) {
        if (selectedMessages.size > 0) {
            deleteSelectedBtn.classList.remove('hidden');
            cancelSelectionBtn.classList.remove('hidden'); // Show cancel button
            deleteSelectedBtn.textContent = `Delete Selected (${selectedMessages.size})`;
        } else {
            deleteSelectedBtn.classList.add('hidden');
            cancelSelectionBtn.classList.add('hidden'); // Hide cancel button
        }
    }
}

function cancelSelection() {
    // Remove 'selected-message' class from all currently selected elements
    selectedMessages.forEach(id => {
        const element = messagesBox.querySelector(`[data-message-id="${id}"]`);
        if (element) {
            element.classList.remove('selected-message');
        }
    });
    selectedMessages.clear(); // Clear the set
    updateDeleteButtonState(); // Update button visibility
    showNotification('Message selection cancelled.', 'info', 1500);
}

async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) {
        showNotification('No messages selected for deletion.', 'info');
        return;
    }

    // Confirmation dialog (using a custom modal would be better than alert in production)
    const confirmDelete = confirm(`Are you sure you want to delete ${selectedMessages.size} selected message(s)?`);
    if (!confirmDelete) {
        return;
    }

    const messageIdsToDelete = Array.from(selectedMessages);

    try {
        const response = await fetch(`${backendUrl}/api/messages`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ ids: messageIdsToDelete })
        });

        if (response.ok) {
            showNotification(`Successfully deleted ${selectedMessages.size} message(s).`, 'success');
            // Remove messages from the DOM
            messageIdsToDelete.forEach(id => {
                const element = messagesBox.querySelector(`[data-message-id="${id}"]`);
                if (element) {
                    element.remove();
                }
            });
            selectedMessages.clear(); // Clear selection
            updateDeleteButtonState(); // Update button state
        } else {
            const errorData = await response.json();
            showNotification(`Failed to delete messages: ${errorData.message || 'Unknown error'}`, 'error');
            console.error('Delete messages failed:', errorData);
        }
    } catch (error) {
        showNotification('Network error during message deletion.', 'error');
        console.error('Network error deleting messages:', error);
    }
}

// --- Theme Toggle Functions ---
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-theme'); // Toggle the dark-theme class

    // Save preference to local storage
    if (body.classList.contains('dark-theme')) {
        localStorage.setItem('theme', 'dark');
        showNotification('Dark theme activated!', 'info', 1000);
    } else {
        localStorage.setItem('theme', 'light');
        showNotification('Light theme activated!', 'info', 1000);
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        // Default to light if no theme saved or if it's 'light'
        document.body.classList.remove('dark-theme');
    }
}

// --- NEW: Online Users Display Functions ---
function displayActiveUsers(users) {
    onlineUsersList.innerHTML = ''; // Clear existing list
    // Sort users alphabetically, putting the current user first if they are online
    users.sort((a, b) => {
        if (a.username === currentUser) return -1;
        if (b.username === currentUser) return 1;
        return a.username.localeCompare(b.username);
    });

    if (users.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No other users online.';
        onlineUsersList.appendChild(li);
    } else {
        users.forEach(user => {
            addActiveUserToList(user);
        });
    }
    // Update count is implicitly handled by list length
}

function addActiveUserToList(user) {
    // Prevent adding duplicates if already present (e.g., on reconnect)
    if (onlineUsersList.querySelector(`li[data-username="${user.username}"]`)) {
        return;
    }
    const li = document.createElement('li');
    li.dataset.username = user.username; // Store username for easy removal
    li.classList.add('online-user-item');

    const profilePicSrc = user.profilePicUrl ? `${backendUrl}${user.profilePicUrl}` : 'https://placehold.co/20x20/cccccc/ffffff?text=P';
    li.innerHTML = `
        <img src="${profilePicSrc}" alt="${user.username}" class="online-user-pic">
        <span class="online-indicator"></span>
        <span class="online-username">${user.username}</span>
        ${user.username === currentUser ? '<span class="you-label">(You)</span>' : ''}
    `;
    onlineUsersList.appendChild(li);
}

function removeActiveUserFromList(user) {
    const userElement = onlineUsersList.querySelector(`li[data-username="${user.username}"]`);
    if (userElement) {
        userElement.remove();
    }
}

function clearActiveUsersList() {
    onlineUsersList.innerHTML = '';
    // No need to update activeUsersCount as it's not a direct DOM element anymore.
    // The count will be derived from onlineUsersList.children.length when displayActiveUsers is called.
}


// --- Event Listeners ---

registerBtn.addEventListener('click', registerUser);
loginBtn.addEventListener('click', loginUser);
logoutBtn.addEventListener('click', logoutUser);
sendBtn.addEventListener('click', sendMessage);
cancelReplyBtn.addEventListener('click', cancelReply); // Event listener for cancel reply button

// Event listener for file upload button to trigger hidden input
// Note: You might have removed #upload-file-btn from HTML, adjust if needed
const uploadFileBtn = document.getElementById('upload-file-btn');
if (uploadFileBtn) { // Check if the button exists before adding listener
    uploadFileBtn.addEventListener('click', () => {
        fileInput.click();
    });
}


messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

fileInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

joinRoomBtn.addEventListener('click', () => {
    const newRoom = roomSelect.value;
    if (newRoom !== currentRoom) {
        currentRoom = newRoom;
        currentRoomDisplay.textContent = currentRoom;
        connectSocket(); // Reconnect socket to join new room
        fetchMessages(currentRoom); // Fetch messages for new room
        clearActiveUsersList(); // Clear active users when changing rooms
        showNotification(`Joined room: ${newRoom}`, 'info');
    }
});

// Profile picture upload listeners
uploadProfilePicBtn.addEventListener('click', () => {
    profilePicInput.click(); // Trigger the hidden file input
});

profilePicInput.addEventListener('change', uploadProfilePicture); // Listen for file selection


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    currentToken = localStorage.getItem('chatAppToken');
    currentUser = localStorage.getItem('chatAppUser');
    const storedProfilePic = localStorage.getItem('chatAppProfilePic');

    createScrollToTopButton(); // Create the button on DOM load
    loadTheme(); // NEW: Load theme on initial DOM load

    if (currentToken && currentUser) {
        updateHeaderProfile(currentUser, storedProfilePic); // Update header on initial load
        showChatSection();
        logoutBtn.classList.remove('hidden'); // Show logout button on initial authenticated load
    } else {
        showSection(authSection);
        updateHeaderProfile('Guest', null); // Set default for guest
        logoutBtn.classList.add('hidden'); // Ensure logout button is hidden if not logged in
    }
});
