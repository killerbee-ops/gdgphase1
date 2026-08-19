const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dbService = require('../services/dbService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'guardianlink-super-secret-key-123';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Native Node scrypt hashing utility functions
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(salt + ":" + derivedKey.toString('hex'));
    });
  });
}

function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    if (!hash || !hash.includes(':')) {
      return resolve(false);
    }
    const [salt, key] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}

// Token helper
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
}

// JWT Authorization Middleware for Express
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: "Access denied. Login required." });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: "Invalid session. Please login again." });
  }
}

// --- AUTH ROUTE ENDPOINTS ---

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format (e.g. name@domain.com)." });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const existingUser = await dbService.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered." });
    }

    // Secure password hashing
    const pwHash = await hashPassword(password);
    const user = await dbService.createUser(email, pwHash);
    
    // Seed default settings for the new user automatically
    await dbService.getSettings(user.id);

    const token = generateToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: TOKEN_EXPIRY_MS,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    console.error("[Auth Register Error]:", err.message);
    res.status(500).json({ error: "Failed to register user: " + err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  try {
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const token = generateToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: TOKEN_EXPIRY_MS,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    console.error("[Auth Login Error]:", err.message);
    res.status(500).json({ error: "Login failed: " + err.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Check Session Checkpoint
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, user: decoded });
  } catch (err) {
    res.clearCookie('token');
    res.status(401).json({ authenticated: false });
  }
});

module.exports = {
  router,
  requireAuth
};
