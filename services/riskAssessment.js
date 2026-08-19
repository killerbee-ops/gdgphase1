// Risk Assessment Engine - Phase 2 Intelligent Layer
const aiService = require('./aiService');
const alertService = require('./alertService');
const dbService = require('./dbService');

// In-memory rolling buffer Map of user transcript lists
const transcriptBuffers = new Map();

function getTranscriptBuffer(userId) {
  if (!transcriptBuffers.has(userId)) {
    transcriptBuffers.set(userId, []);
  }
  return transcriptBuffers.get(userId);
}

function clearTranscriptBuffer(userId) {
  transcriptBuffers.set(userId, []);
}

/**
 * Appends a segment to the rolling buffer and evaluates the risk pattern
 */
async function evaluateRiskPattern(userId, newSegment) {
  const buffer = getTranscriptBuffer(userId);
  if (newSegment && newSegment.trim().length > 0) {
    buffer.push(newSegment.trim());
  }

  // Keep only the last 5 segments
  if (buffer.length > 5) {
    buffer.shift();
  }

  // Evaluate pattern across segments
  const evaluation = await aiService.evaluatePatternDistress(buffer);
  return {
    ...evaluation,
    buffer: [...buffer]
  };
}

/**
 * Routes alerts based on computed risk level
 */
async function routeAlert(userId, incidentId, riskLevel, reason, mapsLink, shareUrl) {
  const contacts = await dbService.getContacts(userId);
  const settings = await dbService.getSettings(userId);
  const userName = settings.user_name || "GuardianLink User";

  const timeStamp = new Date().toLocaleString();
  let alertBody = "";
  let emailSubject = "";
  let dispatched = [];

  if (riskLevel === 'high') {
    emailSubject = `EMERGENCY ALERT: ${userName} needs immediate assistance`;
    alertBody = `EMERGENCY ALERT: ${userName} has triggered a GuardianLink alarm. Potential high-risk distress detected. Reason: ${reason}. Location: ${mapsLink}.\nTrack live location trail here: ${shareUrl}\nTimestamp: ${timeStamp}. Please investigate immediately!`;

    if (contacts.length > 0) {
      // Notify all contacts via both channels
      const promises = contacts.map(c => alertService.dispatchAlertToContact(c, alertBody, emailSubject));
      dispatched = await Promise.all(promises);
    }
  } else if (riskLevel === 'medium') {
    emailSubject = `[Precautionary Check] GuardianLink Alert for ${userName}`;
    alertBody = `[Precautionary Check] GuardianLink detected potential medium-risk distress for ${userName}. Reason: ${reason}. Location: ${mapsLink}.\nTrack live location trail here: ${shareUrl}\nTimestamp: ${timeStamp}.`;

    if (contacts.length > 0) {
      // Notify ONLY primary contact via SMS only (or email if phone is not set)
      const primaryContact = contacts[0];
      const smsResult = await alertService.dispatchAlertToContact(
        { ...primaryContact, email: null }, // Nullify email to route only via SMS
        alertBody,
        emailSubject
      );
      dispatched = [smsResult];
    }
  } else {
    // Low / none: Log silently without contact notification
    alertBody = `[Silent Safety Log] GuardianLink recorded normal check-in or low-risk status. Reason: ${reason}. Location: ${mapsLink}. Timestamp: ${timeStamp}.`;
    dispatched = [{ success: true, channel: 'none', message: 'Logged silently.' }];
  }

  return {
    alertBody,
    emailSubject,
    dispatched
  };
}

module.exports = {
  getTranscriptBuffer,
  clearTranscriptBuffer,
  evaluateRiskPattern,
  routeAlert
};
