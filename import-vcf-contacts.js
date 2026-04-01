#!/usr/bin/env node

/**
 * VCF Contact Bulk Import Script
 * Parses a vCard (.vcf) file and imports all contacts into the messenger app
 *
 * Usage: node import-vcf-contacts.js <path-to-file.vcf>
 * Example: node import-vcf-contacts.js "/path/to/Grammie Contacts.vcf"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

// Configuration
const MESSENGER_HOST = process.env.MESSENGER_HOST || 'localhost';
const MESSENGER_PORT = process.env.MESSENGER_PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node import-vcf-contacts.js <path-to-vcf-file>');
  console.error('Example: node import-vcf-contacts.js "Grammie Contacts.vcf"');
  process.exit(1);
}

const vcfPath = args[0];

// Verify file exists
if (!fs.existsSync(vcfPath)) {
  console.error(`❌ File not found: ${vcfPath}`);
  process.exit(1);
}

// ── Parse VCF File ──────────────────────────────────────────────
function parseVCF(content) {
  const contacts = [];
  const vcardRegex = /BEGIN:VCARD[\s\S]*?END:VCARD/g;
  const matches = content.match(vcardRegex) || [];

  matches.forEach((vcard) => {
    const contact = {};

    // Extract FN (Full Name) - fallback to N (structured name)
    let fnMatch = vcard.match(/^FN:(.+)$/m);
    if (fnMatch) {
      contact.name = fnMatch[1].trim();
    } else {
      // Parse N field: N:LastName;FirstName;;;
      let nMatch = vcard.match(/^N:([^;]*);([^;]*)(?:;([^;]*))?(?:;([^;]*))?(?:;([^;]*))?$/m);
      if (nMatch) {
        const lastName = nMatch[1].trim();
        const firstName = nMatch[2].trim();
        contact.name = `${firstName}${lastName ? ' ' + lastName : ''}`.trim();
      }
    }

    // Extract TEL (phone number) - prefer 'pref' type
    let telMatches = vcard.match(/^TEL(?:;[^:]*)?:(.+)$/gm) || [];

    // First try to find preferred phone
    let prefMatch = vcard.match(/^TEL;type=pref:(.+)$/m);
    if (prefMatch) {
      contact.phone = prefMatch[1].trim();
    } else if (telMatches.length > 0) {
      // Use first phone if no preference
      let match = telMatches[0].match(/:(.+)$/);
      if (match) {
        contact.phone = match[1].trim();
      }
    }

    // Only add if we have at least a name and phone
    if (contact.name && contact.phone) {
      contacts.push(contact);
    }
  });

  return contacts;
}

// ── Generate Room ID ────────────────────────────────────────────
function generateRoomId() {
  return crypto.randomBytes(12).toString('hex');
}

// ── Send HTTP Request ───────────────────────────────────────────
function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: MESSENGER_HOST,
      port: MESSENGER_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// ── Add Contact to Messenger ────────────────────────────────────
async function addContact(name, phone) {
  const roomId = generateRoomId();
  try {
    const response = await makeRequest('POST', '/api/contacts', {
      name,
      phone,
      roomId
    });

    if (response.status === 201 || response.status === 200) {
      return {
        success: true,
        name,
        phone,
        roomId,
        link: `http://${MESSENGER_HOST}:${MESSENGER_PORT}/chat/${roomId}`
      };
    } else {
      return {
        success: false,
        name,
        phone,
        error: response.data.error || `HTTP ${response.status}`
      };
    }
  } catch (err) {
    return {
      success: false,
      name,
      phone,
      error: err.message
    };
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Reading VCF file...');

  try {
    const content = fs.readFileSync(vcfPath, 'utf-8');
    const contacts = parseVCF(content);

    if (contacts.length === 0) {
      console.error('❌ No valid contacts found in VCF file');
      process.exit(1);
    }

    console.log(`\n📋 Found ${contacts.length} contact(s). Starting import...\n`);

    const results = [];
    let successful = 0;
    let failed = 0;

    // Import each contact
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      process.stdout.write(`[${i + 1}/${contacts.length}] Importing ${contact.name}... `);

      const result = await addContact(contact.name, contact.phone);
      results.push(result);

      if (result.success) {
        successful++;
        console.log('✅');
      } else {
        failed++;
        console.log(`❌ (${result.error})`);
      }

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ IMPORT COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Successfully imported: ${successful}/${contacts.length}`);
    if (failed > 0) {
      console.log(`Failed: ${failed}`);
    }

    // Print chat links for successful imports
    if (successful > 0) {
      console.log(`\n📱 Chat Links for Each Contact:`);
      console.log(`${'='.repeat(60)}`);
      results
        .filter(r => r.success)
        .forEach(r => {
          console.log(`\n${r.name}`);
          console.log(`Phone: ${r.phone}`);
          console.log(`Link: ${r.link}`);
        });
    }

    // List failures if any
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log(`\n⚠️  Failed Imports:`);
      console.log(`${'='.repeat(60)}`);
      failures.forEach(f => {
        console.log(`\n❌ ${f.name} (${f.phone})`);
        console.log(`   Error: ${f.error}`);
      });
    }

    console.log('\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
