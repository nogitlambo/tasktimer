const RESERVED_USERNAMES = new Set([
  "admin",
  "support",
  "system",
  "root",
  "null",
  "undefined",
  "api",
  "login",
  "signup",
  "me",
]);

const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export function normalizeUsername(username: string): string {
  return String(username || "").trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    return "Username is required.";
  }

  if (!USERNAME_REGEX.test(normalized)) {
    return "Username must be 3 to 20 characters and use only letters, numbers, or underscores.";
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return "That username is reserved. Please choose another.";
  }

  return null;
}
