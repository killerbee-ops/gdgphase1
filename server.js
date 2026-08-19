require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// 1. ENVIRONMENT KEY VALIDATION (FAIL FAST ON BOOT)
const isProduction = process.env.NODE_ENV === 'production';
console.log(`[Boot] GuardianLink running in [${process.env.NODE_ENV || 'development'}] mode.`);

if (isProduction) {
  const requiredKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
  const missingKeys = requiredKeys.filter(k => !process.env[k]);
  
  if (missingKeys.length > 0) {
    console.error(`\n❌ [Fatal] Environment Configuration Failed: Missing keys: [${missingKeys.join(', ')}] in production environment.\n`);
    process.exit(1);
  }
} else {
  // Warn about local sandbox mock mode
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ [Warning] Supabase keys missing. Server running in local mock data mode (using local_db.json).");
  }
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn("⚠️ [Warning] AI API keys missing. Server running in local mock AI mode (regex keywords).");
  }
  if (!process.env.TWILIO_ACCOUNT_SID && !process.env.SMTP_USER) {
    console.warn("⚠️ [Warning] Messaging credentials missing. Alerts will print to system console only.");
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Configurations
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 2. RATE LIMITERS FOR SPAM PROTECTION
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictTriggerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 SOS triggers or AI classifications per minute
  message: { error: "Rate limit exceeded. Emergency controls restricted to avoid spam." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/sos/trigger', strictTriggerLimiter);
app.use('/api/ai/classify', strictTriggerLimiter);

// 3. HEALTH CHECK ROUTE
app.get('/health', async (req, res) => {
  const dbService = require('./services/dbService');
  const dbType = dbService.checkSupabaseConnected() ? 'Supabase (Production)' : 'Local File DB (Sandbox)';
  
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    database: {
      active: true,
      type: dbType
    },
    uptime: process.uptime()
  });
});

// 4. PUBLIC SHARING ENDPOINT (UNAUTHENTICATED)
app.get('/api/public/share/:incidentId', async (req, res) => {
  const incidentId = req.params.incidentId;
  if (!incidentId) return res.status(400).json({ error: "Incident ID is required." });

  try {
    const dbService = require('./services/dbService');
    const incident = await dbService.getPublicIncidentStatus(incidentId);
    
    if (!incident) {
      return res.status(404).json({ error: "Safety sharing session not found." });
    }

    if (incident.status !== 'active') {
      return res.json({ active: false, error: "This safety sharing session has ended." });
    }

    const trail = await dbService.getLocationTrail(incidentId);
    res.json({
      active: true,
      user_name: incident.user_name,
      transcript: incident.transcript,
      timestamp: incident.timestamp,
      latest: {
        latitude: incident.latitude,
        longitude: incident.longitude,
        accuracy: incident.accuracy
      },
      trail
    });
  } catch (err) {
    console.error("[Public Share API Error]:", err.message);
    res.status(500).json({ error: "Failed to load sharing details." });
  }
});

// 5. ROUTER MOUNTING
const authRouter = require('./routes/auth').router;
const apiRouter = require('./routes/api');

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Start server listener
app.listen(PORT, () => {
  console.log(`GuardianLink Server running on http://localhost:${PORT}`);
});
