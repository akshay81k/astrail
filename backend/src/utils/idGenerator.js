const crypto = require('crypto');

function generateRandomHex(length = 6) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function generateId(prefix = 'id') {
  return `${prefix}_${generateRandomHex(8)}`;
}

const idGen = {
  session: () => generateId('ses'),
  fault: () => generateId('flt'),
  incident: () => generateId('inc'),
  anomaly: () => generateId('ano'),
  upload: () => generateId('upl'),
  evalRun: () => generateId('run'),
  request: () => generateId('req')
};

module.exports = idGen;
