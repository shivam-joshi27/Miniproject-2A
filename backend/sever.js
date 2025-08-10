/*
Project: Chatting app backend (Express.js + MongoDB + JWT + Socket.IO)
Files included below. Follow the README at the end to run locally.
*/

// package.json
{
  "name": "chat-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "mongoose": "^7.0.0",
    "socket.io": "^4.7.2"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}



const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const authRoutes = require('./routes/auth');
const convRoutes = require('./routes/conversations');
const msgRoutes = require('./routes/messages');
const { verifySocketToken } = require('./middleware/socketAuth');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', convRoutes);
app.use('/api/messages', msgRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Socket.IO setup
const io = new Server(server, { cors: { origin: '*' } });

// Simple socket auth middleware
io.use(async (socket, next) => {
  try {
    await verifySocketToken(socket);
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  const userId = socket.userId;
  onlineUsers.set(userId, socket.id);
  console.log('User connected:', userId);

  // join user to their own room for private events
  socket.join(userId);

  socket.on('send_message', (payload) => {
    // payload: { conversationId, toUserId, text }
    const { toUserId } = payload;
    const toSocketId = onlineUsers.get(toUserId);
    // emit to recipient if online
    if (toSocketId) {
      io.to(toSocketId).emit('receive_message', payload);
    }
    // always emit ack to sender
    socket.emit('message_sent', payload);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    console.log('User disconnected:', userId);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/* ------------------------- models/User.js ------------------------- */

const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = model('User', userSchema);

/* ------------------------- models/Conversation.js ------------------------- */

const { Schema: S, model: M } = require('mongoose');

const conversationSchema = new S({
  members: [{ type: S.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = M('Conversation', conversationSchema);

/* ------------------------- models/Message.js ------------------------- */

const { Schema: Schema2, model: model2 } = require('mongoose');

const messageSchema = new Schema2({
  conversationId: { type: Schema2.Types.ObjectId, ref: 'Conversation' },
  sender: { type: Schema2.Types.ObjectId, ref: 'User' },
  text: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = model2('Message', messageSchema);

/* ------------------------- middleware/auth.js ------------------------- */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ msg: 'Invalid token' });
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};

/* ------------------------- middleware/socketAuth.js ------------------------- */

const jwt2 = require('jsonwebtoken');

exports.verifySocketToken = async (socket) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) throw new Error('No token');
  const decoded = jwt2.verify(token, process.env.JWT_SECRET);
  socket.userId = decoded.id;
};

/* ------------------------- routes/auth.js ------------------------- */

const express2 = require('express');
const router = express2.Router();
const bcrypt = require('bcryptjs');
const jwt3 = require('jsonwebtoken');
const User2 = require('../models/User');

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ msg: 'Please enter all fields' });
    const existing = await User2.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'User already exists' });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = new User2({ name, email, password: hash });
    await user.save();
    const token = jwt3.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User2.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
    const token = jwt3.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

/* ------------------------- routes/conversations.js ------------------------- */

const express3 = require('express');
const router3 = express3.Router();
const Conversation = require('../models/Conversation');
const { auth: authMiddleware } = require('../middleware/auth');

// Create conversation between two users
router3.post('/', authMiddleware, async (req, res) => {
  try {
    const { memberId } = req.body; // other user id
    const members = [req.user._id, memberId];
    // check existing
    let conv = await Conversation.findOne({ members: { $all: members } });
    if (conv) return res.json(conv);
    conv = new Conversation({ members });
    await conv.save();
    res.json(conv);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Get user's conversations
router3.get('/', authMiddleware, async (req, res) => {
  try {
    const convs = await Conversation.find({ members: req.user._id }).populate('members', 'name email');
    res.json(convs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router3;

/* ------------------------- routes/messages.js ------------------------- */

const express4 = require('express');
const router4 = express4.Router();
const Message = require('../models/Message');
const { auth } = require('../middleware/auth');

// Send message (persist)
router4.post('/', auth, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const message = new Message({ conversationId, sender: req.user._id, text });
    await message.save();
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Get messages for conversation
router4.get('/:conversationId', auth, async (req, res) => {
  try {
    const msgs = await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1 });
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router4;

/* ------------------------- .env (example) ------------------------- */

// MONGO_URI=mongodb+srv://USER:PASS@cluster0.mongodb.net/chatapp?retryWrites=true&w=majority
// JWT_SECRET=your_super_secret_here
// PORT=5000

/* ------------------------- README / How to run ------------------------- */

/*
1. Save files into a folder structure:

  chat-backend/
  ├─ package.json
  ├─ server.js
  ├─ .env
  ├─ models/
  │   ├─ User.js
  │   ├─ Conversation.js
  │   └─ Message.js
  ├─ routes/
  │   ├─ auth.js
  │   ├─ conversations.js
  │   └─ messages.js
  └─ middleware/
      ├─ auth.js
      └─ socketAuth.js

2. npm install
3. create .env with your MONGO_URI and JWT_SECRET
4. npm run dev

Socket usage (client side):
- connect: const socket = io('http://localhost:5000', { auth: { token } });
- send: socket.emit('send_message', { conversationId, toUserId, text });
- receive: socket.on('receive_message', (payload) => {});

Notes & Next steps:
- Add message read receipts, typing indicators, file uploads (use S3 or GridFS).
- Add rate-limiting, input sanitization, and validation (express-validator).
- Use HTTPS and secure cookies in production. Rotate JWT secret and consider refresh tokens.
- Use Redis for socket scaling (socket.io-redis adapter) when multiple server instances.
*/
