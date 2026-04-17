/**
 * ICN Checksum Calculator
 * 
 * Credits:
 * - andy.mccarty@va.gov
 * - shane.elliott@va.gov
 * 
 * Repository: https://github.ec.va.gov/shane-elliott/icnchecksum
 * Developed with assistance from GitHub Copilot (Claude Sonnet 4.5)
 * 
 * This module provides utilities for calculating and validating VA ICN checksums.
 */

import { stringTable } from './config.js';

function dg(r, offset, p) {
  let x = stringTable[r - 1][0];
  let pos = ((offset) * 16) + p - 1;
  return String(x).charAt(pos);
}

/**
 * Calculate the checksum for a given ICN
 * @param {string} icn - The ICN without checksum (10-16 digits)
 * @returns {string} The 6-character checksum
 */
export function calculateICNChecksum(icn) {
  // Pad to 16 digits
  let num = icn;
  while (num.length < 16) {
    num = '0' + num;
  }

  let tab = [];
  let mpimap = [];

  for (var i = 1; i < 7; i++) {
    mpimap[i] = [];
  }

  for (var it = 1; it <= 6; it++) {
    let map = [];
    map[it] = [];
    map[it][0] = 0;
    for (var id = 1; id <= 16; id++) {
      var val = String(num).charAt(id - 1);
      mpimap[it][id] = val;
      let sum = (Number(val) + Number(map[it][id - 1])) % 10;
      let mv = dg(it, sum, id);
      map[it][id] = mv;
    }
    tab[it] = map[it][16];
  }

  let hash = tab[1] + tab[2] + tab[3] + tab[4] + tab[5] + tab[6];
  return hash;
}

/**
 * Ensure an ICN has a checksum, calculating it if needed
 * @param {string} icn - The ICN with or without checksum
 * @returns {string} ICN with checksum in format: {icn}V{checksum}
 */
export function ensureICNChecksum(icn) {
  // If already has checksum (contains 'V'), return as-is
  if (icn.includes('V')) {
    return icn;
  }

  // Calculate checksum
  const checksum = calculateICNChecksum(icn);
  return `${icn}V${checksum}`;
}
