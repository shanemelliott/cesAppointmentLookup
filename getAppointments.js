import https from 'https';
import http from 'http';
import readline from 'readline';
import { tokenServer, api } from './config.js';
import { ensureICNChecksum } from './icnChecksum.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
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
          // Try to parse as JSON
          const json = JSON.parse(data);
          if (json.token) {
            resolve(json.token.trim());
          } else {
            resolve(data.trim());
          }
        } catch (e) {
          // Not JSON, use as-is
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
  
  // Build URL with proper encoding
  const params = new URLSearchParams();
  params.append('patient:Patient.identifier', `urn:oid:2.16.840.1.113883.4.349|${icn}`);
  params.append('date', `ge${startDateTime}`);
  params.append('date', `lt${endDateTime}`);
  
  const url = `${api.baseUrl}/Appointment?${params.toString()}`;
  
  console.log('\nFetching appointments...');
  console.log(`Searching from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
  console.log(`  (${startDateTime} to ${endDateTime})\n`);
  
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
          console.error(`\nAPI Error (${res.statusCode}):`, data.substring(0, 500));
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
      console.error('Error fetching appointments:', error.message);
      reject(error);
    });
    
    req.end();
  });
}

function formatAppointment(appointment) {
  const datetime = appointment.start || 'N/A';
  
  // Extract patient name/identifier
  let patientInfo = 'N/A';
  if (appointment.participant) {
    const patientParticipant = appointment.participant.find(p => 
      p.actor?.type === 'Patient'
    );
    if (patientParticipant) {
      patientInfo = patientParticipant.actor.display || patientParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Extract clinic/healthcareService
  let clinic = 'N/A';
  if (appointment.participant) {
    const clinicParticipant = appointment.participant.find(p => 
      p.actor?.type === 'HealthcareService'
    );
    if (clinicParticipant) {
      clinic = clinicParticipant.actor.display || clinicParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Extract provider
  let provider = 'N/A';
  if (appointment.participant) {
    const providerParticipant = appointment.participant.find(p => 
      p.actor?.type === 'Practitioner'
    );
    if (providerParticipant) {
      provider = providerParticipant.actor.display || providerParticipant.actor.identifier?.value || 'N/A';
    }
  }
  
  // Extract location (facility)
  let location = 'N/A';
  if (appointment.participant) {
    const locationParticipant = appointment.participant.find(p => 
      p.actor?.type === 'Location'
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

function displayAppointments(bundle) {
  if (!bundle.entry || bundle.entry.length === 0) {
    console.log('No appointments found.');
    return;
  }
  
  console.log(`\nFound ${bundle.total || bundle.entry.length} appointment(s):\n`);
  console.log('='.repeat(120));
  
  bundle.entry.forEach((entry, index) => {
    if (entry.resource && entry.resource.resourceType === 'Appointment') {
      const appt = formatAppointment(entry.resource);
      
      console.log(`\nAppointment ${index + 1}:`);
      console.log(`  Date/Time: ${appt.datetime}`);
      console.log(`  Status:    ${appt.status}`);
      console.log(`  Patient:   ${appt.patient}`);
      console.log(`  Clinic:    ${appt.clinic}`);
      console.log(`  Location:  ${appt.location}`);
      console.log(`  Provider:  ${appt.provider}`);
      if (appt.comment) {
        console.log(`  Comment:   ${appt.comment}`);
      }
      console.log(`  ID:        ${appt.id}`);
      console.log('-'.repeat(120));
    }
  });
}

async function main() {
  try {
    console.log('VA Appointment Retrieval Tool\n');
    
    const icn = await question('Enter Patient ICN (e.g., 1011568236V299349): ');
    
    if (!icn.trim()) {
      console.log('Error: ICN is required');
      rl.close();
      return;
    }
    
    // Ensure ICN has checksum
    const fullICN = ensureICNChecksum(icn.trim());
    if (fullICN !== icn.trim()) {
      console.log(`ICN with checksum: ${fullICN}`);
    }
    
    console.log('\nGetting authentication token...');
    const token = await getToken();
    console.log('Token retrieved successfully.');
    
    const appointments = await getAppointments(fullICN, token);
    
    displayAppointments(appointments);
    
  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    rl.close();
  }
}

main();
