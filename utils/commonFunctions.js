export function isEmptyValue(value) {
  return value === undefined || value === null || value === '';
}

export function toSafeString(value) {
  return isEmptyValue(value) ? '' : String(value).trim();
}