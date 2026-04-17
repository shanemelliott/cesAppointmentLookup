import readline from 'readline';
import { ensureICNChecksum } from './icnChecksum.js';
import { getToken, getAppointments, formatAppointment } from './appointmentsLib.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
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
    
    const appointments = await getAppointments(fullICN, token, true);
    
    displayAppointments(appointments);
    
  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    rl.close();
  }
}

main();
