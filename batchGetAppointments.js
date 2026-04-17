import https from 'https';
import http from 'http';
import fs from 'fs';
import { patients, tokenServer, api } from './config.js';
import { ensureICNChecksum } from './icnChecksum.js';

function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseJWT(token);
  if (!payload || !payload.exp) return true;
  
  // Check if token expires in less than 60 seconds
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < (now + 60);
}

async function getToken() {
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

async function getAppointments(icn, token) {
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
      reject(error);
    });
    
    req.end();
  });
}

function formatAppointmentForCSV(appointment, icn, site) {
  const datetime = appointment.start || '';
  
  let patientInfo = '';
  let clinic = '';
  let location = '';
  let provider = '';
  
  if (appointment.participant) {
    const patientParticipant = appointment.participant.find(p => p.actor?.type === 'Patient');
    if (patientParticipant) {
      patientInfo = patientParticipant.actor.display || '';
    }
    
    const clinicParticipant = appointment.participant.find(p => p.actor?.type === 'HealthcareService');
    if (clinicParticipant) {
      clinic = clinicParticipant.actor.display || '';
    }
    
    const locationParticipant = appointment.participant.find(p => p.actor?.type === 'Location');
    if (locationParticipant) {
      location = locationParticipant.actor.display || locationParticipant.actor.identifier?.value || '';
    }
    
    const providerParticipant = appointment.participant.find(p => p.actor?.type === 'Practitioner');
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

function escapeCSV(value) {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function main() {
  console.log('VA Batch Appointment Retrieval\n');
  console.log(`Processing ${patients.length} patients...\n`);
  
  let token = null;
  let allAppointments = [];
  
  for (let i = 0; i < patients.length; i++) {
    const patient = patients[i];
    const fullICN = ensureICNChecksum(patient.icn);
    
    console.log(`[${i + 1}/${patients.length}] Processing ICN: ${fullICN} (${patient.site})`);
    
    try {
      // Get or refresh token if needed
      if (!token || isTokenExpired(token)) {
        console.log('  Getting new token...');
        token = await getToken();
      }
      
      // Get appointments
      const result = await getAppointments(fullICN, token);
      
      if (result.entry && result.entry.length > 0) {
        let count = 0;
        result.entry.forEach(entry => {
          if (entry.resource && entry.resource.resourceType === 'Appointment') {
            const appt = formatAppointmentForCSV(entry.resource, fullICN, patient.site);
            allAppointments.push(appt);
            count++;
          }
        });
        console.log(`  Found ${count} appointment(s)`);
      } else {
        console.log(`  No appointments found`);
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, api.requestDelay));
      
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
  }
  
  // Write to CSV
  if (allAppointments.length > 0) {
    const csvFile = 'appointments.csv';
    const headers = ['ICN', 'Site', 'Source', 'Appointment ID', 'Date/Time', 'Status', 'Patient', 'Clinic', 'Location', 'Provider', 'Comment'];
    
    let csvContent = headers.join(',') + '\n';
    
    allAppointments.forEach(appt => {
      const row = [
        escapeCSV(appt.icn),
        escapeCSV(appt.site),
        escapeCSV(appt.source),
        escapeCSV(appt.appointmentId),
        escapeCSV(appt.datetime),
        escapeCSV(appt.status),
        escapeCSV(appt.patient),
        escapeCSV(appt.clinic),
        escapeCSV(appt.location),
        escapeCSV(appt.provider),
        escapeCSV(appt.comment)
      ];
      csvContent += row.join(',') + '\n';
    });
    
    fs.writeFileSync(csvFile, csvContent, 'utf8');
    console.log(`\n✓ Exported ${allAppointments.length} appointment(s) to ${csvFile}`);
  } else {
    console.log('\nNo appointments found for any patients.');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
