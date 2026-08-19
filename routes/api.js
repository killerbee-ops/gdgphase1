const express = require('express');
const { requireAuth } = require('./auth');
const dbService = require('../services/dbService');
const aiService = require('../services/aiService');
const alertService = require('../services/alertService');
const locationService = require('../services/locationService');
const riskAssessment = require('../services/riskAssessment');

const router = express.Router();
const activeCommutes = new Map();

// Apply auth protection middleware globally to this router
router.use(requireAuth);

// --- SECURE INPUT VALIDATION FUNCTIONS ---

function validateEmail(email) {
  if (!email) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  if (!phone) return true;
  const phoneRegex = /^\+?[0-9\s\-()]{6,18}$/;
  return phoneRegex.test(phone);
}

function validatePin(pin) {
  if (!pin) return false;
  const pinRegex = /^[0-9]{4,8}$/;
  return pinRegex.test(pin);
}

function sanitizeString(str) {
  if (!str) return '';
  return str.trim().replace(/[<>]/g, '');
}

// --- API ROUTES ---

// Get Contacts
router.get('/contacts', async (req, res) => {
  try {
    const list = await dbService.getContacts(req.user.id);
    res.json(list);
  } catch (err) {
    console.error(`[API Contacts GET] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to load contacts." });
  }
});

// Save/Update Contact
router.post('/contacts', async (req, res) => {
  const { id, name, phone, email } = req.body;
  
  const cleanName = sanitizeString(name);
  const cleanPhone = sanitizeString(phone);
  const cleanEmail = sanitizeString(email);

  if (!cleanName || cleanName.length === 0) {
    return res.status(400).json({ error: "Name is required." });
  }
  if (cleanName.length > 50) {
    return res.status(400).json({ error: "Name is too long. Max 50 characters." });
  }
  if (!cleanPhone && !cleanEmail) {
    return res.status(400).json({ error: "Provide at least a phone number or email address." });
  }
  if (!validateEmail(cleanEmail)) {
    return res.status(400).json({ error: "Invalid email format." });
  }
  if (!validatePhone(cleanPhone)) {
    return res.status(400).json({ error: "Invalid phone number format." });
  }

  try {
    const contact = await dbService.saveContact(req.user.id, {
      id: id || null,
      name: cleanName,
      phone: cleanPhone || null,
      email: cleanEmail || null
    });
    res.json({ success: true, contact });
  } catch (err) {
    console.error(`[API Contacts POST] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete Contact
router.post('/contacts/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Contact ID is required." });

  try {
    await dbService.deleteContact(req.user.id, id);
    res.json({ success: true });
  } catch (err) {
    console.error(`[API Contacts DELETE] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to delete contact." });
  }
});

// Get Settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await dbService.getSettings(req.user.id);
    res.json(settings);
  } catch (err) {
    console.error(`[API Settings GET] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to load safety settings." });
  }
});

// Save Settings
router.post('/settings', async (req, res) => {
  const settings = req.body;
  
  if (settings.settings_pin && !validatePin(settings.settings_pin)) {
    return res.status(400).json({ error: "PIN must be numeric, between 4 and 8 digits." });
  }
  
  if (settings.user_name) {
    settings.user_name = sanitizeString(settings.user_name).slice(0, 50);
  }
  if (settings.safe_word) {
    settings.safe_word = sanitizeString(settings.safe_word).toLowerCase().slice(0, 30);
  }

  try {
    await dbService.saveSettings(req.user.id, settings);
    res.json({ success: true });
  } catch (err) {
    console.error(`[API Settings POST] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to save safety settings." });
  }
});

// Get Incident history logs
router.get('/incidents', async (req, res) => {
  try {
    const list = await dbService.getIncidents(req.user.id);
    res.json(list);
  } catch (err) {
    console.error(`[API Incidents GET] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to load incidents." });
  }
});

// AI Speech Classification
router.post('/ai/classify', async (req, res) => {
  const { transcript } = req.body;
  const cleanTranscript = sanitizeString(transcript).slice(0, 1000);

  try {
    // 1. Evaluate safety risk pattern using rolling transcript buffer
    const evaluation = await riskAssessment.evaluateRiskPattern(req.user.id, cleanTranscript);
    const { riskLevel, reason, confidence, buffer } = evaluation;

    // 2. Map riskLevel to danger_level for client-side backward compatibility
    const danger_level = riskLevel === 'none' ? 'low' : riskLevel;

    // 3. Log to active incident history timeline if exists
    const activeIncident = await dbService.getActiveIncident(req.user.id);
    if (activeIncident) {
      let aiClassification = activeIncident.ai_classification;
      if (typeof aiClassification === 'string') {
        try { aiClassification = JSON.parse(aiClassification); } catch (e) { aiClassification = null; }
      }
      if (!aiClassification || typeof aiClassification !== 'object') {
        aiClassification = {};
      }
      if (!Array.isArray(aiClassification.history)) {
        aiClassification.history = [];
      }
      
      aiClassification.history.push({
        timestamp: new Date().toISOString(),
        riskLevel,
        reason,
        confidence
      });

      aiClassification.riskLevel = riskLevel;
      aiClassification.reason = reason;
      aiClassification.confidence = confidence;
      aiClassification.danger_level = danger_level;

      await dbService.updateIncidentClassification(activeIncident.id, aiClassification);
    }

    res.json({
      danger_level,
      riskLevel,
      reason,
      confidence,
      buffer
    });
  } catch (err) {
    console.error(`[API AI Classify] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Speech classification failed." });
  }
});

// --- NEW SOS TRAIL POSITION UPDATE ENDPOINT ---
router.post('/sos/update-location', async (req, res) => {
  const { incidentId, latitude, longitude, accuracy, address: manualAddress } = req.body;

  let lat = parseFloat(latitude);
  let lng = parseFloat(longitude);
  let acc = parseFloat(accuracy);

  if (isNaN(lat) || lat < -90 || lat > 90) return res.status(400).json({ error: "Invalid latitude." });
  if (isNaN(lng) || lng < -180 || lng > 180) return res.status(400).json({ error: "Invalid longitude." });
  if (isNaN(acc) || acc < 0) return res.status(400).json({ error: "Invalid accuracy." });
  if (!incidentId) return res.status(400).json({ error: "Incident ID is required." });

  try {
    // 1. Convert to human-readable address with reverse geocoding or use manual address
    const address = manualAddress ? sanitizeString(manualAddress).slice(0, 200) : await locationService.reverseGeocode(lat, lng);
    
    // 2. Append coordinates trail
    await dbService.appendLocationTrail(req.user.id, incidentId, lat, lng, acc, address);

    // 3. Evaluate geofence boundaries (exiting triggers SMS/Email warnings automatically)
    await locationService.evaluateSafeZones(req.user.id, lat, lng, acc, address);

    res.json({ success: true, address });
  } catch (err) {
    console.error("[API SOS Update Location Error]:", err.message);
    res.status(500).json({ error: "Failed to append trail coordinates: " + err.message });
  }
});

// --- NEW SAFE ZONES / GEOFENCES ENDPOINTS ---
router.get('/safe-zones', async (req, res) => {
  try {
    const list = await dbService.getSafeZones(req.user.id);
    res.json(list);
  } catch (err) {
    console.error(`[API SafeZones GET] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to load safe zones." });
  }
});

router.post('/safe-zones', async (req, res) => {
  const { id, name, latitude, longitude, radius_meters } = req.body;

  const cleanName = sanitizeString(name);
  let lat = parseFloat(latitude);
  let lng = parseFloat(longitude);
  let radius = parseFloat(radius_meters);

  if (!cleanName || cleanName.length === 0) return res.status(400).json({ error: "Safe zone name is required." });
  if (isNaN(lat) || lat < -90 || lat > 90) return res.status(400).json({ error: "Invalid latitude." });
  if (isNaN(lng) || lng < -180 || lng > 180) return res.status(400).json({ error: "Invalid longitude." });
  if (isNaN(radius) || radius <= 0) return res.status(400).json({ error: "Radius must be a positive number of meters." });

  try {
    const zone = await dbService.saveSafeZone(req.user.id, {
      id: id || null,
      name: cleanName,
      latitude: lat,
      longitude: lng,
      radius_meters: radius
    });
    res.json({ success: true, zone });
  } catch (err) {
    console.error(`[API SafeZones POST] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/safe-zones/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Safe Zone ID is required." });

  try {
    await dbService.deleteSafeZone(req.user.id, id);
    res.json({ success: true });
  } catch (err) {
    console.error(`[API SafeZones DELETE] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Failed to delete safe zone." });
  }
});

// SOS Emergency Trigger
router.post('/sos/trigger', async (req, res) => {
  const { latitude, longitude, accuracy, transcript } = req.body;

  let lat = null;
  let lng = null;
  let acc = null;

  if (latitude !== undefined && latitude !== null) {
    lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) return res.status(400).json({ error: "Invalid latitude value." });
  }
  if (longitude !== undefined && longitude !== null) {
    lng = parseFloat(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) return res.status(400).json({ error: "Invalid longitude value." });
  }
  if (accuracy !== undefined && accuracy !== null) {
    acc = parseFloat(accuracy);
    if (isNaN(acc) || acc < 0) return res.status(400).json({ error: "Invalid accuracy value." });
  }

  const cleanTranscript = sanitizeString(transcript).slice(0, 500);

  try {
    // 1. Verify contacts configured
    const contacts = await dbService.getContacts(req.user.id);
    if (contacts.length === 0) {
      return res.status(400).json({ error: "No trusted contacts found. Please add at least one contact to trigger alarm." });
    }

    const settings = await dbService.getSettings(req.user.id);
    const userName = settings.user_name || "GuardianLink User";

    // 2. Perform REVERSE GEOCODING (Nominatim API) on initial coordinates
    let address = '';
    if (lat !== null && lng !== null) {
      address = await locationService.reverseGeocode(lat, lng);
    }

    // 3. Save Incident in DB
    const incident = await dbService.createIncident(
      req.user.id,
      lat,
      lng,
      acc,
      cleanTranscript || null,
      null, // aiClassification
      null  // alertBody (will update shortly)
    );

    // 4. Save initial coordinate point in location_trail
    if (lat !== null && lng !== null) {
      await dbService.appendLocationTrail(req.user.id, incident.id, lat, lng, acc, address);
    }

    // 5. Generate shareable time-limited live tracking link
    const host = req.get('host');
    const shareUrl = `${req.protocol}://${host}/share.html?id=${incident.id}`;

    // 6. Form location details string including reverse geocoded address
    let mapsLink = "Unavailable (Location permission denied/failed)";
    if (lat !== null && lng !== null) {
      mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
      if (acc !== null) {
        mapsLink += ` (Accuracy: ${Math.round(acc)}m)`;
      }
    }

    // 7. Determine riskLevel and reason
    let riskLevel = req.body.riskLevel;
    let reason = req.body.reason;

    if (!riskLevel) {
      if (cleanTranscript && cleanTranscript.length > 0) {
        const evaluation = await riskAssessment.evaluateRiskPattern(req.user.id, cleanTranscript);
        riskLevel = evaluation.riskLevel;
        reason = evaluation.reason;
      } else {
        riskLevel = 'high';
        reason = 'Manual user-activated emergency trigger';
      }
    }

    // 8. Dispatch alerts using smart routing rules
    const routeResult = await riskAssessment.routeAlert(
      req.user.id,
      incident.id,
      riskLevel,
      reason,
      mapsLink,
      shareUrl
    );
    const { alertBody, emailSubject, dispatched: dispatchResults } = routeResult;

    // 9. Save final classification history
    const aiClassification = {
      riskLevel,
      reason,
      confidence: 1.0,
      history: [{
        timestamp: new Date().toISOString(),
        riskLevel,
        reason,
        confidence: 1.0
      }]
    };

    incident.ai_classification = aiClassification;
    incident.ai_drafted_message = alertBody;

    if (dbService.checkSupabaseConnected()) {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('incidents').update({
        ai_classification: aiClassification,
        ai_drafted_message: alertBody
      }).eq('id', incident.id);
    }

    const maskedLat = lat !== null ? lat.toFixed(1) + '***' : null;
    const maskedLng = lng !== null ? lng.toFixed(1) + '***' : null;
    console.log(`[SOS Triggered] User ID: ${req.user.id}. Incident ID: ${incident.id}. Initial Address: "${address}". Location masked: [${maskedLat}, ${maskedLng}].`);

    res.json({
      success: true,
      incidentId: incident.id,
      ai_drafted: !!(cleanTranscript && aiService.checkAIEnabled()),
      message: alertBody,
      dispatched: dispatchResults
    });

  } catch (err) {
    console.error(`[API SOS Trigger] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "Emergency trigger failed: " + err.message });
  }
});

// SOS Emergency Resolution
router.post('/sos/resolve', async (req, res) => {
  const { pinOrSafeWord, incidentId } = req.body;
  const cleanInput = sanitizeString(pinOrSafeWord).toLowerCase();

  if (!cleanInput) {
    return res.status(400).json({ error: "PIN or safe-word is required to resolve." });
  }

  try {
    const settings = await dbService.getSettings(req.user.id);
    const settingsPin = settings.settings_pin || "1234";
    const safeWord = (settings.safe_word || "cancel").trim().toLowerCase();

    if (cleanInput !== settingsPin && cleanInput !== safeWord) {
      return res.status(400).json({ error: "Incorrect PIN or safe-word. Verification failed." });
    }

    const resolvedIncident = await dbService.resolveIncident(req.user.id, incidentId || null, cleanInput);
    riskAssessment.clearTranscriptBuffer(req.user.id);
    
    // Dispatch safety check-in to contacts
    const userName = settings.user_name || "GuardianLink User";
    const timestamp = new Date().toLocaleString();
    const safeBody = `SAFE CONFIRMATION: ${userName} has marked their GuardianLink alarm as RESOLVED and confirmed they are safe. Timestamp: ${timestamp}.`;
    const emailSubject = `SAFE CONFIRMATION: ${userName} is safe`;

    const contacts = await dbService.getContacts(req.user.id);
    const dispatchPromises = contacts.map(contact =>
      alertService.dispatchAlertToContact(contact, safeBody, emailSubject)
    );
    const dispatchResults = await Promise.all(dispatchPromises);

    console.log(`[SOS Resolved] User ID: ${req.user.id}. Incident ID: ${resolvedIncident.id}.`);

    res.json({
      success: true,
      resolvedIncident,
      dispatched: dispatchResults
    });

  } catch (err) {
    console.error(`[API SOS Resolve] User ID: ${req.user.id}. Error:`, err.message);
    res.status(500).json({ error: "SOS resolution failed: " + err.message });
  }
});

// Haversine distance calculator
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 1. Start Commute / Trip Mode
router.post('/commute/start', async (req, res) => {
  const { destination, expectedRoute, etaMinutes } = req.body;

  if (!destination) {
    return res.status(400).json({ error: "Destination is required." });
  }

  activeCommutes.set(req.user.id, {
    destination: sanitizeString(destination).slice(0, 100),
    expectedRoute: Array.isArray(expectedRoute) ? expectedRoute : null,
    etaMinutes: parseInt(etaMinutes) || 15,
    startTime: Date.now(),
    lastCoordinates: null
  });

  console.log(`[Commute Start] User ID: ${req.user.id}. Destination: "${destination}".`);
  res.json({ success: true, message: "Commute mode active." });
});

// 2. Commute Location Update & Deviation Check
router.post('/commute/update', async (req, res) => {
  const { latitude, longitude, accuracy, simulateDeviation, simulateStop } = req.body;
  const commute = activeCommutes.get(req.user.id);

  if (!commute) {
    return res.json({ success: false, error: "No active commute session." });
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "Invalid coordinates." });
  }

  commute.lastCoordinates = { lat, lng, timestamp: Date.now() };

  // Check simulations first
  if (simulateDeviation) {
    console.warn(`[Route Deviation Simulated] User ID: ${req.user.id}.`);
    return res.json({ success: true, deviate: true, reason: "Route deviation simulated (User went off expected path)." });
  }

  if (simulateStop) {
    console.warn(`[Extended Stop Simulated] User ID: ${req.user.id}.`);
    return res.json({ success: true, deviate: true, reason: "Extended stop simulated (No movement detected)." });
  }

  // Real calculations
  if (commute.expectedRoute && commute.expectedRoute.length > 0) {
    let minDistance = Infinity;
    for (const point of commute.expectedRoute) {
      const dist = getDistance(lat, lng, point.lat, point.lng);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }

    // Devate if the user is more than 100 meters away from the closest expected path point
    if (minDistance > 100) {
      console.warn(`[Route Deviation Detected] User ID: ${req.user.id}. Distance: ${minDistance.toFixed(1)}m.`);
      return res.json({
        success: true,
        deviate: true,
        reason: `Route deviation detected: user is ${Math.round(minDistance)} meters off-route.`
      });
    }
  }

  res.json({ success: true, deviate: false });
});

// 3. End Commute / Trip Mode
router.post('/commute/end', async (req, res) => {
  if (activeCommutes.has(req.user.id)) {
    activeCommutes.delete(req.user.id);
    console.log(`[Commute End] User ID: ${req.user.id}.`);
  }
  res.json({ success: true, message: "Commute session ended." });
});

module.exports = router;
