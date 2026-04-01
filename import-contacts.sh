#!/bin/bash

# Simple wrapper to run the VCF import script
# Usage: ./import-contacts.sh /path/to/contacts.vcf

if [ $# -eq 0 ]; then
    echo "Usage: ./import-contacts.sh /path/to/contacts.vcf"
    echo "Example: ./import-contacts.sh 'Grammie Contacts.vcf'"
    exit 1
fi

VCF_FILE="$1"

# Check if file exists
if [ ! -f "$VCF_FILE" ]; then
    echo "❌ File not found: $VCF_FILE"
    exit 1
fi

echo "🚀 Starting contact import from: $VCF_FILE"
echo ""

# Run the import script
node import-vcf-contacts.js "$VCF_FILE"
