const fs = require('fs');
const glob = require('glob');

const enJson = JSON.parse(fs.readFileSync('frontend/src/i18n/locales/en/translation.json', 'utf-8'));

// Verify that JSON is well-formed
console.log("Translations OK");
