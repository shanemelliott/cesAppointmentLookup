// Configuration file for VA Appointment Retrieval
// Copy this file to config.js and update with your patient ICNs

// ICN Checksum String Table
// REQUIRED: This table is needed for ICN checksum calculation
// Reference: https://vivian.worldvista.org/dox/Routine_MPIFSPC_source.html
// Find the stringTable array in the MPIFSPC routine and copy it here
export const stringTable = [
  // Add the 6 rows of the string table here
  // Example format:
  // ['row1data...'],
  // ['row2data...'],
  // etc.
];

export const patients = [
  { icn: '1234567890', site: '556 (Example Site)' },
  { icn: '9876543210', site: '757 (Example Site)' },
  // Add more patients as needed
];

// Token server configuration
export const tokenServer = {
  url: 'http://localhost:3000'
};

// API configuration
export const api = {
  baseUrl: 'https://staff.apps.va.gov/ces/v1',
  // Number of days in the past to search for appointments
  daysBack: 30,
  // Number of days in the future to search for appointments
  daysForward: 90,
  // Delay between API calls in milliseconds (to avoid overwhelming the server)
  requestDelay: 500
};
