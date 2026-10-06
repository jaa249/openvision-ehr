// Rules shown in the browser and enforced on the server (auth.ts imports these).
// NIST SP 800-63B: length matters, composition rules do not.
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const PASSWORD_HINT = `${PASSWORD_MIN}-${PASSWORD_MAX} characters, no other rules: a short sentence is easy to remember and hard to guess. Very common passwords and your username are refused.`;
