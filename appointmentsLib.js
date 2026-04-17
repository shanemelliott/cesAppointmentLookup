/**
 * VA Appointments Library
 * 
 * Author: shane.elliott@va.gov
 * Developed with assistance from GitHub Copilot (Claude Sonnet 4.5)
 * 
 * Shared utilities for fetching and formatting VA appointments via FHIR API
 */

import https from 'https';
import http from 'http';
import { tokenServer, api } from './config.js';

/**
 * Helper function to determine participant type
 * Handles both Vista format (actor.type) and Oracle Health format (type array + reference)
 */
function getParticipantType(participant) {
  // Vista format: actor.type directly
  if (participant.actor?.type) {
    return participant.actor.type;
  }
  
  // Oracle Health format: check type array coding
  if (participant.type && Array.isArray(participant.type)) {
    for (const typeObj of participant.type) {
      if (typeObj.coding && Array.isArray(typeObj.coding)) {
        for (const coding of typeObj.coding) {
          if (coding.display === 'Patient') return 'Patient';
          if (coding.display === 'Resource' && participant.actor?.reference?.startsWith('Practitioner/')) {
            return 'Practitioner';
          }
        }
      }
      // Also check text field
      if (typeObj.text === 'Patient') return 'Patient';
    }
  }
  
  // Fallback: check actor.reference
  if (participant.actor?.reference) {
    const ref = participant.actor.reference;
    if (ref.startsWith('Patient/')) return 'Patient';
    if (ref.startsWith('Practitioner/')) return 'Practitioner';
    if (ref.startsWith('Location/')) return 'Location';
    if (ref.startsWith('HealthcareService/')) return 'HealthcareService';
  }
  
  return null;
}

/**
 * Parse a JWT token and return its payload
 * @param {string} token - JWT token
 * @returns {object|null} Parsed JWT payload or null if invalid
 */
export function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

/**
 * Check if a JWT token is expired or will expire soon
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired or expires in < 60 seconds
 */
export function isTokenExpired(token) {
  const payload = parseJWT(token);
  if (!payload || !payload.exp) return true;
  
  // Check if token expires in less than 60 seconds
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < (now + 60);
}

/**
 * Fetch a JWT token from the token server
 * @returns {Promise<string>} JWT token
 */
export async function getToken() {
  return new Promise((resolve, reject) => {
    http.get(tokenServer.url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.token) {
            resolve(json.token.trim());
          } else {
            resolve(data.trim());
          }
        } catch (e) {
          resolve(data.trim());
        }
      });
    }).on('error', (error) => {
      console.error('Error fetching token:', error.message);
      reject(error);
    });
  });
}

/**
 * Fetch appointments for a patient from the VA FHIR API
 * @param {string} icn - Patient ICN with checksum
 * @param {string} token - JWT token
 * @param {boolean} verbose - Whether to log detailed information (default: false)
 * @returns {Promise<object>} FHIR Bundle containing appointments
 */
export async function getAppointments(icn, token, verbose = false) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - api.daysBack);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + api.daysForward);
  
  const startDateTime = startDate.toISOString();
  const endDateTime = endDate.toISOString();
  
  const params = new URLSearchParams();
  params.append('patient:Patient.identifier', `urn:oid:2.16.840.1.113883.4.349|${icn}`);
  params.append('date', `ge${startDateTime}`);
  params.append('date', `lt${endDateTime}`);
  
  const url = `${api.baseUrl}/Appointment?${params.toString()}`;
  
  if (verbose) {
    console.log('\nFetching appointments...');
    console.log(`Searching from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    console.log(`  (${startDateTime} to ${endDateTime})\n`);
  }
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        'x-vamf-jwt': token
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          if (verbose) {
            console.error(`\nAPI Error (${res.statusCode}):`, data.substring(0, 500));
          }
          reject(new Error(`API returned ${res.statusCode}`));
          return;
        }
        
        if (!data) {
          reject(new Error('Empty response from API'));
          return;
        }
        
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      if (verbose) {
        console.error('Error fetching appointments:', error.message);
      }
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Format appointment data for display
 * @param {object} appointment - FHIR Appointment resource
 * @returns {object} Formatted appointment data
 */
export function formatAppointment(appointment) {
  const datetime = appointment.start || 'N/A';
  
  // Extract patient name/identifier
  let patientInfo = 'N/A';
  if (appointment.participant) {
    const patientParticipant = appointment.participant.find(p => 
      getParticipantType(p) === 'Patient'
    );
    if (patientParticipant) {
      patientInfo = patientParticipant.actor.display || patientParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Extract clinic/healthcareService
  let clinic = 'N/A';
  if (appointment.participant) {
    const clinicParticipant = appointment.participant.find(p => 
      getParticipantType(p) === 'HealthcareService'
    );
    if (clinicParticipant) {
      clinic = clinicParticipant.actor.display || clinicParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Extract provider
  let provider = 'N/A';
  if (appointment.participant) {
    const providerParticipant = appointment.participant.find(p => 
      getParticipantType(p) === 'Practitioner'
    );
    if (providerParticipant) {
      provider = providerParticipant.actor.display || providerParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Extract location (facility)
  let location = 'N/A';
  if (appointment.participant) {
    const locationParticipant = appointment.participant.find(p => 
      getParticipantType(p) === 'Location'
    );
    if (locationParticipant) {
      location = locationParticipant.actor.display || locationParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Get status
  const status = appointment.status || 'unknown';
  
  return {
    datetime: datetime !== 'N/A' ? new Date(datetime).toLocaleString() : 'N/A',
    patient: patientInfo,
    clinic: clinic,
    location: location,
    provider: provider,
    status: status,
    id: appointment.id,
    comment: appointment.comment || ''
  };
}

/**
 * Format appointment data for CSV export
 * @param {object} appointment - FHIR Appointment resource
 * @param {string} icn - Patient ICN
 * @param {string} site - Site identifier
 * @returns {object} Formatted appointment data for CSV
 */
export function formatAppointmentForCSV(appointment, icn, site) {
  const datetime = appointment.start || '';
  
  let patientInfo = '';
  let clinic = '';
  let location = '';
  let provider = '';
  
  if (appointment.participant) {
    const patientParticipant = appointment.participant.find(p => getParticipantType(p) === 'Patient');
    if (patientParticipant) {
      patientInfo = patientParticipant.actor.display || '';
    }
    
    const clinicParticipant = appointment.participant.find(p => getParticipantType(p) === 'HealthcareService');
    if (clinicParticipant) {
      clinic = clinicParticipant.actor.display || '';
    }
    
    const locationParticipant = appointment.participant.find(p => getParticipantType(p) === 'Location');
    if (locationParticipant) {
      location = locationParticipant.actor.display || locationParticipant.actor.identifier?.value || '';
    }
    
    const providerParticipant = appointment.participant.find(p => getParticipantType(p) === 'Practitioner');
    if (providerParticipant) {
      provider = providerParticipant.actor.display || '';
    }
  }
  
  const status = appointment.status || '';
  const comment = appointment.comment || '';
  const source = appointment.meta?.source || '';
  
  return {
    icn,
    site,
    source,
    appointmentId: appointment.id,
    datetime: datetime ? new Date(datetime).toLocaleString() : '',
    status,
    patient: patientInfo,
    clinic,
    location,
    provider,
    comment
  };
}

/**
 * Escape a value for CSV format
 * @param {any} value - Value to escape
 * @returns {string} CSV-safe string
 */
export function escapeCSV(value) {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
