# VA Appointment Retrieval Tool

A Node.js tool for retrieving patient appointment data from the VA Clinical Encounter Service (CES) FHIR API.

## Features

- Retrieve appointments for individual patients or batch process multiple patients
- Automatic ICN checksum calculation (supports ICNs with or without checksums)
- JWT token management with automatic refresh on expiration
- Export appointment data to CSV format
- Configurable date ranges for appointment searches
- Rate limiting to avoid overwhelming the API

## Prerequisites

- Node.js 18+ (for built-in fetch support)
- Access to VA token server (running on localhost:3000)
- Valid VA credentials configured in token server

## Token Server Setup

This tool requires the OCTO STS Token Generator to authenticate with the VA API.

1. Get the token server from: https://va.ghe.com/software/octo-sts-token-generator
2. Follow the token server setup instructions to configure your VA credentials
3. Start the token server (default: http://localhost:3000)
4. Verify the token server is running before using this tool

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the sample configuration file:
   ```bash
   cp config.sample.js config.js
   ```

4. Edit `config.js` with your patient ICNs and settings

## Configuration

Edit `config.js` to configure:

- **stringTable**: ICN checksum lookup table (required - see config.sample.js for instructions)
- **patients**: Array of patient objects with ICN and site information
- **tokenServer.url**: URL of your token server (default: http://localhost:3000)
- **api.baseUrl**: Base URL for the CES API
- **api.daysBack**: Number of days in the past to search (default: 30)
- **api.daysForward**: Number of days in the future to search (default: 90)
- **api.requestDelay**: Delay between API calls in milliseconds (default: 500)

Example configuration:
```javascript
// Get stringTable from: https://vivian.worldvista.org/dox/Routine_MPIFSPC_source.html
export const stringTable = [
  // 6 rows of data from MPIFSPC routine
];

export const patients = [
  { icn: '1234567890', site: '556 (Lovell)' },
  { icn: '1234567891', site: '757 (Columbus)' }
];
```

## Usage

### Interactive Single Patient Lookup

Retrieve appointments for a single patient interactively:

```bash
node getAppointments.js
```

You'll be prompted to enter a patient ICN. The tool will:
- Automatically calculate the checksum if not provided
- Display appointments in a formatted console output
- Show appointment details including date/time, status, clinic, provider, etc.

### Batch Processing

Process multiple patients from the configuration file:

```bash
node batchGetAppointments.js
```

This will:
- Process all patients defined in `config.js`
- Reuse JWT token across requests (refreshing when needed)
- Export all appointments to `appointments.csv`
- Display progress for each patient

### Output Format

The CSV export includes the following columns:

- ICN
- Site
- Source (Vista system identifier)
- Appointment ID
- Date/Time
- Status
- Patient Name
- Clinic
- Location
- Provider
- Comment

## ICN Checksum Calculation

The tool supports ICNs with or without checksums:

- **With checksum**: `1234567890V12345`
- **Without checksum**: `1234567890` (checksum will be calculated automatically)

The checksum is calculated using the VA's algorithm based on a lookup table (stringTable).

**Credits**:
- ICN checksum implementation: andy.mccarty@va.gov, shane.elliott@va.gov
- Repository: https://github.ec.va.gov/shane-elliott/icnchecksum
- StringTable source: https://vivian.worldvista.org/dox/Routine_MPIFSPC_source.html

## Token Management

The tool automatically:
- Fetches JWT tokens from the configured token server
- Parses token expiration time
- Refreshes tokens before they expire (60-second buffer)
- Reuses valid tokens across multiple API calls

## API Details

The tool queries the VA Clinical Encounter Service FHIR API:

**Endpoint**: `https://staff.apps.va.gov/ces/v1/Appointment`

**Documentation**: https://shiny-bassoon-lm5lo53.pages.github.io/StructureDefinition-ces-appointment.html

**Query Parameters**:
- `patient:Patient.identifier`: Patient ICN with OID prefix
- `date`: Date range filters (using FHIR search parameters)

**Headers**:
- `Accept`: `application/fhir+json`
- `x-vamf-jwt`: JWT authentication token

## Error Handling

The tool handles common errors:
- Token server connection failures
- API authentication errors
- Invalid ICN formats
- Network timeouts
- Rate limiting responses

Errors are logged to the console with descriptive messages.



## File Structure

```
.
├── getAppointments.js          # Interactive single patient lookup
├── batchGetAppointments.js     # Batch processing script
├── icnChecksum.js              # ICN checksum calculation library
├── appointmentsLib.js          # Shared appointments API library
├── config.js                   # Configuration (gitignored)
├── config.sample.js            # Sample configuration
├── package.json                # Node.js dependencies
├── .gitignore                  # Git exclusions
└── README.md                   # This file
```

## Troubleshooting

### "Error fetching token"
- Ensure the token server is running on the configured port
- Verify network connectivity to localhost:3000
- Check that the token server is properly configured with your VA credentials
- See Token Server Setup section for installation instructions

### "API returned 400"
- Check that the ICN format is correct
- Verify the date range parameters are valid
- Ensure the JWT token is valid and not expired

### "No appointments found"
- Verify the patient has appointments in the configured date range
- Check that the patient ICN is correct
- Confirm the patient is in the correct Vista system

## Development

### Running in Development

```bash
# Single patient lookup
node getAppointments.js

# Batch processing
node batchGetAppointments.js
```

### Code Structure

- **icnChecksum.js**: Implements VA's checksum algorithm using lookup tables
- **appointmentsLib.js**: Shared library for API calls and data formatting
  - Token management (JWT parsing and expiration checking)
  - HTTPS API client with proper headers
  - Appointment formatting for display and CSV export
- **getAppointments.js**: Interactive CLI for single patient lookup
- **batchGetAppointments.js**: Batch processor with CSV export

## Credits

- **Development**: shane.elliott@va.gov
- **ICN Checksum Implementation**: andy.mccarty@va.gov, shane.elliott@va.gov
- **Token Server (OCTO STS Token Generator)**: andy.mccarty@va.gov (https://va.ghe.com/software/octo-sts-token-generator)
- **Code Generation Assistance**: GitHub Copilot (Claude Sonnet 4.5)

## License

Internal VA use only. Not for public distribution.

## Support

For issues or questions, contact the development team.
