// A stand-in for GitHub in the portal tests (never the real service, never a real token): an in-memory git repository
// served through Playwright route interception for the API calls the editor makes (Git Data API on branch
// "published"), and the public reads viewers make (raw.githubusercontent.com; jsDelivr answers 404 so the raw door is
// the one tested). Hooks inject a failed request or a commit that sneaks in from "another phone".
const crypto = require('crypto');
const OWNER = 'Adibrill1', REPO = 'Brill-AR', BRANCH = 'published';
function create() {
  const blobs = new Map(), trees = new Map(), commits = new Map();
  let head = null, n = 0;
  const m = { blobs, trees, commits, calls: [], failures: [], beforeRef: null, token: null, rawLag: null, slow: 0, repoKB: 415754,
    head: () => head,
    files: (sha) => { const c = commits.get(sha || head); return c ? new Map(trees.get(c.tree)) : new Map(); },
    read: (path, sha) => { const t = m.files(sha), s = t.get(path); return s ? blobs.get(s) : null; },
    catalogue: (sha) => { const b = m.read('index.json', sha); return b ? JSON.parse(b.toString('utf8')) : null; },
    commitCount: () => commits.size,
    // a whole published branch from a folder (index.json, c/, m/): a copy of the real one, read-only, for tests
    seedDir(dir) { const fs = require('fs'), path = require('path'), files = new Map(); const walk = (d, pre) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f, pre + n + '/'); else files.set(pre + n, putBlob(fs.readFileSync(f))); } }; walk(dir, ''); const t = newTree(files), c = newCommit(t, head ? [head] : [], 'seed'); head = c; return c; },
    // writes a commit directly (as another phone would), returns its sha
    sneak(mutate) { const files = m.files(); mutate(files, (text) => putBlob(Buffer.from(text))); const t = newTree(files), c = newCommit(t, head ? [head] : [], 'sneak'); head = c; return c; },
  };
  const gitSha = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])).digest('hex');
  const putBlob = (buf) => { const s = gitSha(buf); blobs.set(s, buf); return s; };
  const newTree = (files) => { const s = crypto.createHash('sha1').update('tree' + (n++) + JSON.stringify([...files])).digest('hex'); trees.set(s, new Map(files)); return s; };
  const newCommit = (tree, parents, message) => { const s = crypto.createHash('sha1').update('commit' + (n++) + tree).digest('hex'); commits.set(s, { tree, parents, message }); return s; };
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  async function api(route) {
    const req = route.request(), url = new URL(req.url()), method = req.method(), path = url.pathname.replace('/repos/' + OWNER + '/' + REPO, '');
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE' } });
    const body = req.postData() ? JSON.parse(req.postData()) : null, auth = req.headers()['authorization'] || '';
    m.calls.push({ method, path, size: (req.postData() || '').length });
    if (m.slow && method === 'GET') await new Promise((r) => setTimeout(r, m.slow)); // a slow line: the editor's reads take this long
    for (const f of m.failures) if (!f.used && f.when({ method, path, body })) { f.used = true; return json(route, f.status || 500, { message: 'injected failure' }); }
    if (path === '/contents/index.json' && method === 'GET') { const b = m.read('index.json'); return b ? route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: b }) : json(route, 404, { message: 'Not Found' }); }
    if (!m.token || auth !== 'Bearer ' + m.token) return json(route, 401, { message: 'Bad credentials' });
    if (path === '' && method === 'GET') return json(route, 200, { full_name: OWNER + '/' + REPO, private: false, size: m.repoKB });
    if (path === '/git/ref/heads/' + BRANCH && method === 'GET') return head ? json(route, 200, { ref: 'refs/heads/' + BRANCH, object: { sha: head, type: 'commit' } }) : json(route, 404, { message: 'Not Found' });
    let x;
    if ((x = path.match(/^\/git\/commits\/([0-9a-f]{40})$/)) && method === 'GET') { const c = commits.get(x[1]); return c ? json(route, 200, { sha: x[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })) }) : json(route, 404, {}); }
    if ((x = path.match(/^\/git\/trees\/([0-9a-f]{40})$/)) && method === 'GET') { const t = trees.get(x[1]); return t ? json(route, 200, { sha: x[1], tree: [...t].map(([p, sha]) => ({ path: p, mode: '100644', type: 'blob', sha })), truncated: false }) : json(route, 404, {}); }
    if ((x = path.match(/^\/git\/blobs\/([0-9a-f]{40})$/)) && method === 'GET') { const b = blobs.get(x[1]); return b ? json(route, 200, { sha: x[1], content: b.toString('base64'), encoding: 'base64', size: b.length }) : json(route, 404, {}); }
    if (path === '/git/blobs' && method === 'POST') return json(route, 201, { sha: putBlob(Buffer.from(body.content, 'base64')) });
    if (path === '/git/trees' && method === 'POST') {
      const files = body.base_tree ? new Map(trees.get(body.base_tree)) : new Map();
      for (const e of body.tree) { if (e.sha === null) files.delete(e.path); else { if (!blobs.has(e.sha)) return json(route, 422, { message: 'tree.sha not found' }); files.set(e.path, e.sha); } }
      return json(route, 201, { sha: newTree(files) });
    }
    if (path === '/git/commits' && method === 'POST') return json(route, 201, { sha: newCommit(body.tree, body.parents, body.message) });
    if (path === '/git/refs/heads/' + BRANCH && method === 'PATCH') {
      if (m.beforeRef) { const f = m.beforeRef; m.beforeRef = null; f(); }
      const c = commits.get(body.sha); if (!c) return json(route, 422, { message: 'Object does not exist' });
      if (!body.force && c.parents[0] !== head) return json(route, 422, { message: 'Update is not a fast forward' });
      head = body.sha; return json(route, 200, { object: { sha: head } });
    }
    if (path === '/git/refs' && method === 'POST') { if (head) return json(route, 422, { message: 'Reference already exists' }); head = body.sha; return json(route, 201, { object: { sha: head } }); }
    return json(route, 404, { message: 'Not Found (mock): ' + method + ' ' + path });
  }
  async function raw(route) {
    const url = new URL(route.request().url()), p = decodeURIComponent(url.pathname.replace('/' + OWNER + '/' + REPO + '/' + BRANCH + '/', ''));
    m.calls.push({ method: 'RAW', path: p });
    const b = m.read(p, m.rawLag || undefined); // rawLag: serve an older commit, as the 5-minute public cache does
    return b ? route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*', 'cache-control': 'max-age=300' }, body: b }) : route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '404: Not Found' });
  }
  m.attach = async (ctx) => {
    await ctx.route('https://api.github.com/**', api);
    await ctx.route('https://raw.githubusercontent.com/**', raw);
    await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'nope' }));
  };
  return m;
}
// A made-up token in the right shape: a test value, not a credential for anything.
const FAKE_TOKEN = 'github_pat_TEST0000000000000000000000_' + 'x'.repeat(40);
module.exports = { create, FAKE_TOKEN };
