export function validatePasswordComplexity(pw: string): boolean {
  return typeof pw === 'string'
    && pw.length >= 8
    && /[A-Z]/.test(pw)
    && /[a-z]/.test(pw)
    && /\d/.test(pw)
    && /[^A-Za-z0-9]/.test(pw);
}
