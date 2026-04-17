/**
 * VA Appointment Retrieval Tool - Batch Processing
 * 
 * Author: shane.elliott@va.gov
 * Developed with assistance from GitHub Copilot (Claude Sonnet 4.5)
 * Date: April 2026
 */

import fs from 'fs';
import { patients, api } from './config.js';
import { ensureICNChecksum } from './icnChecksum.js';
import { getToken, getAppointments, formatAppointmentForCSV, escapeCSV, isTokenExpired } from './appointmentsLib.js';

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
