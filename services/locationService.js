// Centralized Location & Geofencing Service
const dbService = require('./dbService');
const alertService = require('./alertService');

// Reverse Geocoding via OpenStreetMap Nominatim API
async function reverseGeocode(latitude, longitude) {
  if (latitude === null || longitude === null) return '';

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (isNaN(lat) || isNaN(lng)) return '';

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // Nominatim compliance: User-Agent is strictly required
        'User-Agent': 'GuardianLink-SafetyApp/1.0 (contact@guardianlink.com)'
      }
    });

    if (!res.ok) {
      console.warn(`[Location Service] Nominatim API responded with status ${res.status}`);
      return '';
    }

    const data = await res.json();
    if (!data || !data.address) return data.display_name || '';

    // Build a friendly, high-trust address summary
    const addr = data.address;
    const road = addr.road || addr.pedestrian || addr.suburb || '';
    const village = addr.village || addr.city_district || addr.city || addr.state || '';
    
    if (road && village) {
      return `near ${road}, ${village}`;
    }
    return data.display_name || '';
  } catch (err) {
    console.error("[Location Service] Reverse Geocoding failed:", err.message);
    return ''; // Return empty to fall back gracefully
  }
}

// Compute distance in meters between two coordinate points
function haversineDistance(coords1, coords2) {
  const R = 6371e3; // Earth radius in meters
  const lat1 = coords1.latitude * Math.PI / 180;
  const lat2 = coords2.latitude * Math.PI / 180;
  const deltaLat = (coords2.latitude - coords1.latitude) * Math.PI / 180;
  const deltaLng = (coords2.longitude - coords1.longitude) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // returns distance in meters
}

// Evaluate safe zones and trigger notifications on transitions (exiting)
async function evaluateSafeZones(userId, currentLat, currentLng, accuracy, addressText) {
  const safeZones = await dbService.getSafeZones(userId);
  if (!safeZones || safeZones.length === 0) return [];

  const currentCoords = { latitude: currentLat, longitude: currentLng };
  const breachedZones = [];

  // Fetch the last coordinate trail point to evaluate transition
  // We can query the incident logs to find any active incident or just look at general location trail
  const db = require('./dbService');
  // Find the last recorded location point for the active incident
  const activeIncidents = await dbService.getIncidents(userId);
  const activeInc = activeIncidents.find(i => i.status === 'active');
  
  let lastCoords = null;
  if (activeInc) {
    const trail = await dbService.getLocationTrail(activeInc.id);
    if (trail && trail.length > 0) {
      lastCoords = trail[trail.length - 1]; // get the prior point
    }
  }

  for (const zone of safeZones) {
    if (!zone.is_active) continue;

    const zoneCoords = { latitude: zone.latitude, longitude: zone.longitude };
    const currentDistance = haversineDistance(zoneCoords, currentCoords);
    
    // Check if user is currently outside the safe zone boundary
    const isCurrentlyOutside = currentDistance > zone.radius_meters;

    if (isCurrentlyOutside) {
      let triggerAlert = false;

      if (lastCoords) {
        const lastDistance = haversineDistance(zoneCoords, { latitude: lastCoords.latitude, longitude: lastCoords.longitude });
        const wasPreviouslyInside = lastDistance <= zone.radius_meters;
        
        // Transition: user just stepped outside the safe zone boundary
        if (wasPreviouslyInside) {
          triggerAlert = true;
        }
      } else {
        // First point tracked, and user is already outside
        triggerAlert = true;
      }

      if (triggerAlert) {
        breachedZones.push(zone);
        console.warn(`[GEOFENCE ALERT] User ID: ${userId} has exited safe zone [${zone.name}] boundary! Distance: ${Math.round(currentDistance)}m (Radius: ${zone.radius_meters}m)`);
        
        // Dispatch geofence breach alert to contacts list
        const settings = await dbService.getSettings(userId);
        const userName = settings.user_name || "GuardianLink User";
        const contacts = await dbService.getContacts(userId);
        
        const timestamp = new Date().toLocaleString();
        const locDesc = addressText ? `${addressText} (GPS: ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)})` : `GPS Coordinates: ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`;
        
        const alertBody = `SAFE ZONE ALERT: ${userName} has exited their safe zone [${zone.name}] unexpectedly. Current location: ${locDesc}. Accuracy: ±${Math.round(accuracy)}m. Timestamp: ${timestamp}.`;
        const emailSubject = `SAFE ZONE ALERT: ${userName} exited safe zone`;

        // Send out notifications
        contacts.forEach(contact => {
          alertService.dispatchAlertToContact(contact, alertBody, emailSubject).catch(err => {
            console.error(`[Geofence Notification Error] Failed sending SMS/Email to ${contact.name}:`, err.message);
          });
        });
      }
    }
  }

  return breachedZones;
}

module.exports = {
  reverseGeocode,
  haversineDistance,
  evaluateSafeZones
};
