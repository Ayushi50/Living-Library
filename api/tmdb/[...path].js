// Vercel serverless proxy for TMDB. Keeps the API key on the server (TMDB_API_KEY) so readers
// never need their own. Only the read-only endpoints the app uses are forwarded.
const ALLOWED = [/^\/search\/(movie|tv)$/, /^\/(movie|tv)\/\d+$/];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.TMDB_API_KEY;
  if (!key) return res.status(503).json({ error: 'TMDB is not configured on this deployment.' });

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/tmdb/, '');
  if (!ALLOWED.some((re) => re.test(path))) return res.status(404).json({ error: 'Not found' });

  const params = new URLSearchParams(url.search);
  params.delete('api_key');
  const isToken = key.length > 40; // v4 read-access tokens are long JWTs
  if (!isToken) params.set('api_key', key);

  try {
    const upstream = await fetch(`https://api.themoviedb.org/3${path}?${params}`, {
      headers: { Accept: 'application/json', ...(isToken ? { Authorization: `Bearer ${key}` } : {}) },
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (upstream.ok) res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(upstream.status).send(body);
  } catch {
    return res.status(502).json({ error: 'Could not reach TMDB.' });
  }
}
