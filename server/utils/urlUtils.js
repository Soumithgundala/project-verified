// server/utils/urlUtils.js
// Shared utility to parse GitHub repo URLs into { owner, repo }.
// Extracted here to prevent circular imports between route modules.

export const parseGithubUrl = (url) => {
  if (!url || typeof url !== 'string') {
    console.error('[parseGithubUrl] FATAL: url is undefined or not a string. Received:', url, new Error().stack);
    throw new Error(`parseGithubUrl received invalid url: ${url}`);
  }
  const parts = url.replace('https://github.com/', '').split('/');
  return { owner: parts[0], repo: parts[1] };
};
