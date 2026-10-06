function snakeToCamel(str) {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function camelToSnake(str) {
  return str.replace(/([A-Z])/g, (_, letter) => `_${letter.toLowerCase()}`);
}

function convertKeysToCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamel);
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Date) && !Buffer.isBuffer(obj)) {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      newObj[snakeToCamel(key)] = convertKeysToCamel(obj[key]);
    }
    return newObj;
  }
  return obj;
}

function convertKeysToSnake(obj) {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToSnake);
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Date) && !Buffer.isBuffer(obj)) {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      newObj[camelToSnake(key)] = convertKeysToSnake(obj[key]);
    }
    return newObj;
  }
  return obj;
}

module.exports = {
  snakeToCamel,
  camelToSnake,
  convertKeysToCamel,
  convertKeysToSnake
};
