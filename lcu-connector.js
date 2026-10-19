const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class LcuConnector {
  constructor() {
    this.auth = null; // { port, token, protocol, password }
    this.lastCheck = 0;
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  // 롤 클라이언트 연결 정보 탐색
  async findCredentials() {
    // 1. 프로세스 커맨드라인에서 탐색 (가장 신뢰도 높음)
    try {
      const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = 'LeagueClientUx.exe'\\" | Select-Object -ExpandProperty CommandLine"`;
      const stdout = execSync(psCommand, { encoding: 'utf8', timeout: 4000 });
      
      if (stdout && stdout.includes('--remoting-auth-token=')) {
        const portMatch = stdout.match(/--app-port=([0-9]+)/);
        const tokenMatch = stdout.match(/--remoting-auth-token=([a-zA-Z0-9_-]+)/);

        if (portMatch && tokenMatch) {
          this.auth = {
            port: portMatch[1],
            token: tokenMatch[1],
            protocol: 'https',
            authHeader: 'Basic ' + Buffer.from(`riot:${tokenMatch[1]}`).toString('base64')
          };
          return this.auth;
        }
      }
    } catch (e) {
      // PowerShell 실패 시 lockfile 탐색으로 fallback
    }

    // 2. 롤 기본 설치 경로의 lockfile 탐색
    const commonPaths = [
      'C:\\Riot Games\\League of Legends\\lockfile',
      'D:\\Riot Games\\League of Legends\\lockfile',
      'E:\\Riot Games\\League of Legends\\lockfile',
      'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
      'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile'
    ];

    for (const lockPath of commonPaths) {
      if (fs.existsSync(lockPath)) {
        try {
          const content = fs.readFileSync(lockPath, 'utf8');
          const parts = content.split(':');
          if (parts.length >= 5) {
            const port = parts[2];
            const token = parts[3];
            const protocol = parts[4];
            this.auth = {
              port,
              token,
              protocol,
              authHeader: 'Basic ' + Buffer.from(`riot:${token}`).toString('base64')
            };
            return this.auth;
          }
        } catch (err) {
          // 파일 읽기 실패 무시
        }
      }
    }

    this.auth = null;
    return null;
  }

  async getAuth() {
    const now = Date.now();
    if (!this.auth || now - this.lastCheck > 5000) {
      this.lastCheck = now;
      await this.findCredentials();
    }
    return this.auth;
  }

  // LCU API 요청 수행
  async request(endpoint, method = 'GET', body = null) {
    const auth = await this.getAuth();
    if (!auth) {
      throw new Error('League Client is not running. (롤 클라이언트가 실행되어 있지 않습니다.)');
    }

    const url = `${auth.protocol}://127.0.0.1:${auth.port}${endpoint}`;
    
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        headers: {
          'Authorization': auth.authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        agent: this.agent,
        timeout: 8000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = data ? JSON.parse(data) : {};
              resolve(json);
            } catch (err) {
              resolve(data);
            }
          } else {
            let errorMsg = `LCU Error HTTP ${res.statusCode}`;
            try {
              const errJson = JSON.parse(data);
              errorMsg = errJson.message || errorMsg;
            } catch (e) {}
            reject(new Error(errorMsg));
          }
        });
      });

      req.on('error', (err) => {
        this.auth = null; // 연결 끊김 처리
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('LCU Request Timeout'));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  // 상태 확인
  async isConnected() {
    try {
      const auth = await this.getAuth();
      if (!auth) return false;
      const res = await this.request('/lol-summoner/v1/current-summoner');
      return !!(res && (res.puuid || res.displayName || res.gameName));
    } catch (e) {
      return false;
    }
  }

  // 현재 로그인 소환사 정보
  async getCurrentSummoner() {
    return await this.request('/lol-summoner/v1/current-summoner');
  }

  // 소환사 검색 (이름#태그 또는 소환사명)
  async searchSummoner(nameQuery) {
    // 1. name#tag 분리 시도
    let gameName = nameQuery.trim();
    let tagLine = '';

    if (nameQuery.includes('#')) {
      const parts = nameQuery.split('#');
      gameName = parts[0].trim();
      tagLine = parts[1].trim();
    }

    // 소환사 조회 v1 엔드포인트 시도
    try {
      const encoded = encodeURIComponent(nameQuery);
      const res = await this.request(`/lol-summoner/v1/summoners?name=${encoded}`);
      if (res && res.puuid) return res;
    } catch (e) {}

    // alias / v2 엔드포인트 시도
    try {
      const res = await this.request('/lol-summoner/v2/summoners/names', 'POST', [nameQuery]);
      if (Array.isArray(res) && res.length > 0 && res[0].puuid) {
        return res[0];
      }
    } catch (e) {}

    // 닉네임 부분만 검색 시도
    try {
      const encoded = encodeURIComponent(gameName);
      const res = await this.request(`/lol-summoner/v1/summoners?name=${encoded}`);
      if (res && res.puuid) return res;
    } catch (e) {}

    throw new Error(`소환사 '${nameQuery}'을(를) 찾을 수 없습니다.`);
  }

  // PUUID로 매치 목록 가져오기
  async getMatchList(puuid, begIndex = 0, endIndex = 30) {
    const endpoint = `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${begIndex}&endIndex=${endIndex}`;
    return await this.request(endpoint);
  }

  // 게임 상세 정보 가져오기
  async getGameDetail(gameId) {
    const endpoint = `/lol-match-history/v1/games/${gameId}`;
    return await this.request(endpoint);
  }

  // 게임플로우 상태
  async getGameflowPhase() {
    return await this.request('/lol-gameflow/v1/gameflow-phase');
  }

  // 최근 종료된 게임 EOG 통계
  async getEndOfGameStats() {
    return await this.request('/lol-end-of-game/v1/eog-stats-block');
  }
}

module.exports = new LcuConnector();
