const fs = require('fs');
const os = require('os');
const path = require('path');

// 사용자 데이터(누적 전적, 최근 검색, 자동 갱신 목록)는 프로그램 폴더가 아닌 사용자 폴더에 저장
// → 새 버전 zip을 다른 폴더에 풀어도 기록이 그대로 이어짐
// Windows: %APPDATA%\MAYHEM.GG   (MAYHEM_DATA_DIR 환경변수로 변경 가능)
function resolveDataDir() {
  if (process.env.MAYHEM_DATA_DIR) return path.resolve(process.env.MAYHEM_DATA_DIR);
  const base = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(base, 'MAYHEM.GG');
}

const DATA_DIR = resolveDataDir();
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const RECENT_SEARCHES_FILE = path.join(DATA_DIR, 'recent_searches.json');
const WATCHLIST_FILE = path.join(DATA_DIR, 'auto-refresh.txt');

// 구버전(프로그램 폴더 data/)에 남아 있는 기록을 사용자 폴더로 옮김
// - 같은 소환사 파일이 이미 있으면 경기 수가 더 많은 쪽을 유지
// - 옮긴 뒤 원래 폴더는 history_moved_YYYYMMDD 로 이름만 바꿔 백업으로 남김 (삭제하지 않음)
function migrateLegacyData(appDir) {
  const legacyDir = path.join(appDir, 'data');
  const legacyHistory = path.join(legacyDir, 'history');
  const legacySearches = path.join(legacyDir, 'recent_searches.json');
  const result = { movedFiles: 0, mergedSearches: 0 };

  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  if (path.resolve(legacyDir) === path.resolve(DATA_DIR)) return result;

  const countGames = file => {
    try {
      return (JSON.parse(fs.readFileSync(file, 'utf8')).games || []).filter(g => !g.isGap).length;
    } catch (e) {
      return -1;
    }
  };

  if (fs.existsSync(legacyHistory)) {
    const files = fs.readdirSync(legacyHistory).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const src = path.join(legacyHistory, f);
      const dest = path.join(HISTORY_DIR, f);
      if (!fs.existsSync(dest) || countGames(src) > countGames(dest)) {
        fs.copyFileSync(src, dest);
        result.movedFiles++;
      }
    }
    if (files.length > 0) {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      let backup = path.join(legacyDir, `history_moved_${stamp}`);
      for (let i = 2; fs.existsSync(backup); i++) backup = path.join(legacyDir, `history_moved_${stamp}_${i}`);
      fs.renameSync(legacyHistory, backup);
    }
  }

  if (fs.existsSync(legacySearches)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacySearches, 'utf8'));
      const current = fs.existsSync(RECENT_SEARCHES_FILE) ? JSON.parse(fs.readFileSync(RECENT_SEARCHES_FILE, 'utf8')) : [];
      const byPuuid = new Map();
      for (const item of [...current, ...legacy]) {
        const prev = byPuuid.get(item.puuid);
        if (!prev || (item.searchedAt || 0) > (prev.searchedAt || 0)) byPuuid.set(item.puuid, item);
      }
      const merged = [...byPuuid.values()].sort((a, b) => (b.searchedAt || 0) - (a.searchedAt || 0)).slice(0, 10);
      fs.writeFileSync(RECENT_SEARCHES_FILE, JSON.stringify(merged, null, 2), 'utf8');
      fs.renameSync(legacySearches, `${legacySearches}.moved`);
      result.mergedSearches = legacy.length;
    } catch (e) {
      console.warn('[DataDir] 최근 검색 이전 실패:', e.message);
    }
  }

  return result;
}

module.exports = { DATA_DIR, HISTORY_DIR, RECENT_SEARCHES_FILE, WATCHLIST_FILE, migrateLegacyData };
