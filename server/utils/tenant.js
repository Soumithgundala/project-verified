export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';

const API_KEYS = {
  "abc123": "college_A",
  "xyz789": "college_B"
};

export function resolveTenantId(req) {
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.replace("Bearer ", "").trim();
    if (API_KEYS[apiKey]) {
      return API_KEYS[apiKey];
    }
  }

  // Fallback for local development or if no matching API key
  return DEFAULT_TENANT_ID;
}
