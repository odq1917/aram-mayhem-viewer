const { version: CURRENT_VERSION } = require('./package.json');

const RELEASES_API = 'https://api.github.com/repos/odq1917/aram-mayhem-viewer/releases/latest';
const CACHE_MS = 6 * 60 * 60 * 1000; // 성공 결과는 6시간 캐시 (GitHub 비인증 API 한도 보호)
const ERROR_CACHE_MS = 10 * 60 * 1000; // 실패 시 10분 후 재시도

// "v1.10.0" vs "1.9.2" 형태의 숫자 버전 비교 (a > b 이면 양수)
function compareVersions(a, b) {
  const parse = v => String(v || '').trim().replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

class UpdateChecker {
  constructor() {
    this.cache = null;
    this.cachedAt = 0;
    this.pending = null;
  }

  async check(force = false) {
    const ttl = this.cache?.error ? ERROR_CACHE_MS : CACHE_MS;
    if (!force && this.cache && Date.now() - this.cachedAt < ttl) return this.cache;
    if (!this.pending) {
      this.pending = this.fetchLatest().finally(() => { this.pending = null; });
    }
    return await this.pending;
  }

  async fetchLatest() {
    let result;
    try {
      const res = await fetch(RELEASES_API, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': `aram-mayhem-viewer/${CURRENT_VERSION}`
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
      const release = await res.json();
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      result = {
        current: CURRENT_VERSION,
        latest,
        hasUpdate: Boolean(latest) && compareVersions(latest, CURRENT_VERSION) > 0,
        url: release.html_url,
        title: release.name || `v${latest}`,
        publishedAt: release.published_at,
        checkedAt: Date.now()
      };
    } catch (err) {
      result = {
        current: CURRENT_VERSION,
        hasUpdate: false,
        error: err.message,
        checkedAt: Date.now()
      };
    }
    this.cache = result;
    this.cachedAt = Date.now();
    return result;
  }
}

module.exports = new UpdateChecker();
module.exports.compareVersions = compareVersions;
