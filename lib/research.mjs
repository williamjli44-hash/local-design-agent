import { randomUUID } from 'node:crypto';

export async function searchOpportunities(store, query, { apiKey = process.env.BRAVE_SEARCH_API_KEY, fetcher = fetch } = {}) {
  if (!apiKey) throw new Error('Add BRAVE_SEARCH_API_KEY to your local .env, or import a buyer request in the dashboard.');
  const attempt = store.reserveSearch(query.trim());
  if (attempt.cached) return attempt;
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.search = new URLSearchParams({ q: query, count: '5', freshness: 'pw' }).toString();
    const response = await fetcher(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }, signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}. Check your key, quota, and plan.`);
    const data = await response.json();
    const results = (data.web?.results || []).slice(0, 5).filter(r => /^https?:\/\//.test(r.url)).map(r => ({ id: randomUUID(), url: r.url, title: String(r.title || '').slice(0, 300), description: String(r.description || '').slice(0, 1600), observed_at: new Date().toISOString() }));
    return store.finishSearch(attempt.id, results);
  } catch (error) {
    // Never persist or display provider response bodies/headers, which can contain credentials.
    const message = error.name === 'TimeoutError' ? 'Search request timed out.' : error.message.startsWith('Search provider returned') ? error.message : 'Search request failed. Check your connection and provider settings.';
    store.finishSearch(attempt.id, [], message);
    throw new Error(message);
  }
}
