const fs = require('fs');
const path = require('path');

// 경기 상세에 함께 저장하는 추가 스탯 (LCU stats 필드명 그대로)
const EXTRA_STAT_KEYS = [
  'damageSelfMitigated',        // 피해 감소량
  'timeCCingOthers',            // CC 점수(초)
  'totalTimeCrowdControlDealt', // 총 CC 시간
  'totalDamageDealt',           // 챔피언 외 포함 총 피해
  'damageDealtToTurrets',       // 포탑 피해
  'physicalDamageTaken',
  'magicalDamageTaken',
  'trueDamageTaken',
  'totalUnitsHealed',
  'largestCriticalStrike',
  'largestMultiKill',
  'largestKillingSpree',
  'doubleKills',
  'tripleKills',
  'quadraKills',
  'pentaKills',
  'longestTimeSpentLiving',
  'goldSpent',
  'firstBloodKill',
  'firstBloodAssist'
];

class MetaManager {
  constructor() {
    this.cacheDir = path.join(__dirname, 'cache');
    this.augments = {};
    this.champions = {};
    this.items = {};
    this.spells = {};
    this.perks = {};
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    await Promise.all([
      this.loadAugments(),
      this.loadChampions(),
      this.loadItems(),
      this.loadSpells(),
      this.loadPerks()
    ]);

    this.initialized = true;
    console.log(`[MetaManager] 메타데이터 초기화 완료! (증강체 ${Object.keys(this.augments).length}개 로드됨)`);
  }

  async fetchWithCache(filename, url) {
    const filePath = path.join(this.cacheDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      } catch (e) {}
    }

    try {
      console.log(`[MetaManager] CDN에서 다운로드 중: ${url}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return data;
    } catch (err) {
      console.warn(`[MetaManager] 다운로드 실패 (${url}):`, err.message);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
      return null;
    }
  }

  // 1. 증강체 목록 로드 (CommunityDragon + 나무위키 아수라장 효과 사전 결합)
  async loadAugments() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/cherry-augments.json';
    const list = await this.fetchWithCache('cherry-augments.json', url);

    // 나무위키 아수라장 전용 효과 사전 로드
    let dict = {};
    const dictPath = path.join(__dirname, 'data', 'augments_dict.json');
    if (fs.existsSync(dictPath)) {
      try {
        dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
      } catch (e) {}
    }

    // 이름 -> CDragon 아이콘 경로 맵 빌드
    const nameToIcon = {};
    if (Array.isArray(list)) {
      list.forEach(aug => {
        let iconUrl = '';
        if (aug.augmentSmallIconPath) {
          const cleanPath = aug.augmentSmallIconPath
            .toLowerCase()
            .replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        const n = (aug.nameTRA || aug.augmentNameId || '').trim();
        if (n && iconUrl) {
          nameToIcon[n] = iconUrl;
          nameToIcon[n.replace(/\s+/g, '')] = iconUrl;
        }

        // 인게임 ID 조회를 위해 this.augments에도 기본 매핑
        const dictItem = dict[n] || dict[n.replace(/\s+/g, '')];
        const rarity = dictItem?.rarity || aug.rarity || 'kSilver';
        let rarityLabel = '실버';
        let rarityCode = 'silver';
        if (rarity === 'kGold') {
          rarityLabel = '골드';
          rarityCode = 'gold';
        } else if (rarity === 'kPrismatic') {
          rarityLabel = '프리즘';
          rarityCode = 'prismatic';
        }

        const rawDesc = (dictItem?.rawDescription || aug.descTRA || aug.tooltipTRA || '효과 설명이 등록되지 않았습니다.').replace(/\[\d+\]/g, '').trim();
        const styledDesc = (dictItem?.styledDescription || rawDesc).replace(/\[\d+\]/g, '').trim();

        this.augments[aug.id] = {
          id: aug.id,
          name: n,
          description: rawDesc,
          styledDescription: styledDesc,
          rarity,
          rarityLabel,
          rarityCode,
          iconUrl: iconUrl || 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'
        };
      });
    }

    // 도감 전용 순수 아수라장 증강체 딕셔너리 생성 (나무위키 사전에 있는 것만 등록)
    this.dexAugments = {};
    for (const [name, dictItem] of Object.entries(dict)) {
      const rarity = dictItem.rarity || 'kSilver';
      let rarityLabel = '실버';
      let rarityCode = 'silver';
      if (rarity === 'kGold') {
        rarityLabel = '골드';
        rarityCode = 'gold';
      } else if (rarity === 'kPrismatic') {
        rarityLabel = '프리즘';
        rarityCode = 'prismatic';
      }

      const iconUrl = nameToIcon[name] || nameToIcon[name.replace(/\s+/g, '')] || 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg';

      this.dexAugments[name] = {
        name,
        description: (dictItem.rawDescription || '').replace(/\[\d+\]/g, '').trim(),
        styledDescription: (dictItem.styledDescription || '').replace(/\[\d+\]/g, '').trim(),
        rarity,
        rarityLabel,
        rarityCode,
        iconUrl
      };
    }

    // 최신 신규 패치 증강체 ID 수동 매핑 (CDragon 미등록 신규 증강 대응 및 티어/아이콘 정정)
    const customAugs = {
      2141: {
        id: 2141,
        name: '궁극의 히드라',
        description: '히드라 아이템을 완성하면 티아맷을 획득합니다.\n\n퀘스트: 거대한 히드라, 굶주린 히드라, 불경한 히드라를 보유해야 합니다.\n보상: 궁극의 히드라를 획득합니다.\n\n[궁극의 히드라 효과]\n공격력 200, 체력 1000, 스킬 가속 25, 물리 관통력 25, 모든 피해 흡혈 15%\n기본 공격 시 주변 적들에게 (80% AD + 2% 체력) 물리 피해를 입힙니다.\n사용 시 (10초): 다음 기본 공격이 강화되어 주변 적들에게 (160% AD) 물리 피해, 대상에게 (6% 체력) 및 뒤의 적들에게 (10% 체력) 물리 피해를 입힙니다.',
        styledDescription: '히드라 아이템을 완성하면 티아맷을 획득합니다.<br><br><span class="stat-gold">퀘스트:</span> 거대한 히드라, 굶주린 히드라, 불경한 히드라를 보유해야 합니다.<br><span class="stat-gold">보상:</span> 궁극의 히드라를 획득합니다.<br><br><b>[궁극의 히드라 효과]</b><br><span class="stat-ad">공격력 +200</span> | <span class="stat-hp">체력 +1000</span> | <span class="stat-speed">스킬 가속 +25</span> | <span class="stat-crit">물리 관통력 +25</span> | <span class="stat-vamp">모든 피해 흡혈 15%</span><br>• 기본 공격 시 주변에 <span class="stat-ad">(80% AD + 2% 체력)</span>의 물리 피해.<br>• <b>사용 시 (10초):</b> 다음 공격이 강화되어 주변에 <span class="stat-ad">(160% AD)</span> 물리 피해, 적중 시 <span class="stat-hp">(6% 체력)</span> 및 대상 뒤 적들에게 <span class="stat-hp">(10% 체력)</span> 물리 피해.',
        rarity: 'kPrismatic',
        rarityLabel: '프리즘',
        rarityCode: 'prismatic',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/kiwi/augments/icons/ultrahydra_small.png'
      },
      2157: {
        id: 2157,
        name: '죽음의 무도 업그레이드',
        description: '250골드를 획득합니다.\n\n[업그레이드된 죽음의 무도 효과]\n자신이 받은 피해의 (근접 40% / 원거리 15%)만큼을 3초에 걸쳐 나누어 입습니다.\n처치 관여 시 즉시 (추가 공격력의 125%)만큼 체력을 회복합니다.',
        styledDescription: '<span class="stat-gold">250골드</span>를 획득합니다.<br><br><b>[업그레이드된 죽음의 무도 효과]</b><br>• 자신이 받은 피해의 <span class="stat-armor">(근접 40% / 원거리 15%)</span>만큼을 3초에 걸쳐 나누어 입습니다.<br>• <span class="stat-trigger">처치 관여 시</span> <b>즉시</b> <span class="stat-hp">(추가 공격력의 125%)</span>의 체력을 회복합니다.',
        rarity: 'kSilver',
        rarityLabel: '실버',
        rarityCode: 'silver',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/kiwi/augments/icons/upgradedeathdance_small.png'
      },
      1320: {
        id: 1320,
        name: '징수의 총 업그레이드',
        description: '250골드를 획득합니다.\n\n[업그레이드된 징수의 총 효과]\n처형 시 추가 골드가 25골드에서 50골드로 증가합니다.\n적 처형 시마다 처형 기준치가 0.5%p씩 영구히 증가합니다. (기본 5% → 최대 12.5%)',
        styledDescription: '<span class="stat-gold">250골드</span>를 획득합니다.<br><br><b>[업그레이드된 징수의 총 효과]</b><br>• <span class="stat-trigger">처형 시</span> 추가 골드가 25골드에서 <span class="stat-gold">50골드</span>로 증가합니다.<br>• 적 <span class="stat-trigger">처형 시</span>마다 처형 기준치가 <span class="stat-crit">0.5%p</span>씩 영구히 증가합니다. (기본 5% → 최대 <span class="stat-crit">12.5%</span>)',
        rarity: 'kSilver',
        rarityLabel: '실버',
        rarityCode: 'silver',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/kiwi/augments/icons/upgradecollector_small.png'
      },
      2010: {
        id: 2010,
        name: '한 발에 두 놈',
        description: '치명타 발동 시 적중 시 효과를 한 번 더 적용합니다. 치명타 확률을 25% 얻습니다.',
        styledDescription: '치명타 발동 시 <span class="stat-hit">적중 시 효과</span>를 한 번 더 적용합니다. <span class="stat-crit">치명타 확률 +25%</span>를 얻습니다.',
        rarity: 'kPrismatic',
        rarityLabel: '프리즘',
        rarityCode: 'prismatic',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/cherry/augments/icons/dualwield_small.png'
      },
      156: {
        id: 156,
        name: '우글렛의 마녀 모자',
        description: '즉시: 쓸데없이 큰 지팡이를 획득합니다.\n\n퀘스트: 라바돈의 죽음모자와 존야의 모래시계를 보유해야 합니다.\n보상: 우글렛의 마녀 모자를 획득합니다.\n\n[우글렛의 마녀 모자 효과]\n주문력 +300, 방어력 +50, 스킬 가속 +20\n고유 지속 효과: 총 주문력이 50% 증가합니다.\n고유 사용 효과 - 경직 (60초): 2.5초 동안 무적 및 대상으로 지정할 수 없는 상태가 됩니다.',
        styledDescription: '<span class="stat-gold">즉시:</span> 쓸데없이 큰 지팡이를 획득합니다.<br><br><span class="stat-gold">퀘스트:</span> 라바돈의 죽음모자와 존야의 모래시계를 보유해야 합니다.<br><span class="stat-gold">보상:</span> 우글렛의 마녀 모자를 획득합니다.<br><br><b>[우글렛의 마녀 모자 효과]</b><br><span class="stat-ap">주문력 +300</span> | <span class="stat-armor">방어력 +50</span> | <span class="stat-speed">스킬 가속 +20</span><br>• <b>고유 지속 효과:</b> 총 주문력이 <span class="stat-ap">50%</span> 증가합니다.<br>• <b>고유 사용 효과 - <span class="stat-special">경직</span> (60초):</b> 2.5초 동안 <span class="stat-special">무적</span> 및 대상으로 지정할 수 없는 상태가 됩니다.',
        rarity: 'kPrismatic',
        rarityLabel: '프리즘',
        rarityCode: 'prismatic',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/cherry/augments/icons/quest_woogletswitchcap_small.png'
      },
      1156: {
        id: 1156,
        name: '우글렛의 마녀 모자',
        description: '즉시: 쓸데없이 큰 지팡이를 획득합니다.\n\n퀘스트: 라바돈의 죽음모자와 존야의 모래시계를 보유해야 합니다.\n보상: 우글렛의 마녀 모자를 획득합니다.\n\n[우글렛의 마녀 모자 효과]\n주문력 +300, 방어력 +50, 스킬 가속 +20\n고유 지속 효과: 총 주문력이 50% 증가합니다.\n고유 사용 효과 - 경직 (60초): 2.5초 동안 무적 및 대상으로 지정할 수 없는 상태가 됩니다.',
        styledDescription: '<span class="stat-gold">즉시:</span> 쓸데없이 큰 지팡이를 획득합니다.<br><br><span class="stat-gold">퀘스트:</span> 라바돈의 죽음모자와 존야의 모래시계를 보유해야 합니다.<br><span class="stat-gold">보상:</span> 우글렛의 마녀 모자를 획득합니다.<br><br><b>[우글렛의 마녀 모자 효과]</b><br><span class="stat-ap">주문력 +300</span> | <span class="stat-armor">방어력 +50</span> | <span class="stat-speed">스킬 가속 +20</span><br>• <b>고유 지속 효과:</b> 총 주문력이 <span class="stat-ap">50%</span> 증가합니다.<br>• <b>고유 사용 효과 - <span class="stat-special">경직</span> (60초):</b> 2.5초 동안 <span class="stat-special">무적</span> 및 대상으로 지정할 수 없는 상태가 됩니다.',
        rarity: 'kPrismatic',
        rarityLabel: '프리즘',
        rarityCode: 'prismatic',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/cherry/augments/icons/quest_woogletswitchcap_small.png'
      },
      2143: {
        id: 2143,
        name: '갈라진 하늘 업그레이드',
        description: '갈라진 하늘의 대상별 재사용 대기시간이 5초로 감소하고 잃은 체력의 9%만큼 체력을 회복합니다.\n\n500골드를 획득합니다.',
        styledDescription: '갈라진 하늘의 대상별 재사용 대기시간이 5초로 감소하고 잃은 <span class="stat-hp">체력</span>의 9%만큼 <span class="stat-hp">체력</span>을 회복합니다.<br><br><span class="stat-gold">500골드</span>를 획득합니다.',
        rarity: 'kGold',
        rarityLabel: '골드',
        rarityCode: 'gold',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/cherry/augments/icons/vulnerability_small.png'
      },
      2140: {
        id: 2140,
        name: '굶주린 히드라 업그레이드',
        description: '500골드를 획득합니다.\n\n[업그레이드된 굶주린 히드라 효과]\n생명력 흡수가 20%가 됩니다.\n적에게 스킬 적중 시 쪼개기 효과가 발동됩니다. (스킬당 재사용 대기시간 1초)',
        styledDescription: '<span class="stat-gold">500골드</span>를 획득합니다.<br><br><b>[업그레이드된 굶주린 히드라 효과]</b><br>• 굶주린 히드라의 <span class="stat-vamp">생명력 흡수</span>가 <span class="stat-vamp">20%</span>가 됩니다.<br>• 적에게 <span class="stat-trigger">스킬 적중 시</span> 쪼개기 효과가 발동됩니다. (스킬당 재사용 대기시간 1초)',
        rarity: 'kGold',
        rarityLabel: '골드',
        rarityCode: 'gold',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/kiwi/augments/icons/upgradesheen_small.png'
      },
      154: {
        id: 154,
        name: '우르프의 챔피언',
        description: '퀘스트: 적 챔피언 처치 관여 18회를 달성해야 합니다.\n보상: 퀘스트를 완료하면 황금 뒤집개를 획득합니다.\n\n[황금 뒤집개 효과]\n공격력 +90, 주문력 +110, 공격 속도 +40%, 치명타 확률 +15%, 체력 +200, 방어력 +20, 마법 저항력 +20, 마나 +200, 스킬 가속 +20, 이동 속도 +10%, 생명력 흡수 +10%, 기본 체력 재생 +50%, 기본 마나 재생 +100%\n\n고유 지속 효과 - 불이야!:\n근처 적에게 화상 효과를 적용하고 스킬 재사용 대기시간이 감소합니다. 적 챔피언을 향해 이동할 때 이동 속도가 증가하고 공격 속도 및 마나 재생 속도가 증가합니다. 하지만 입는 피해량이 증가하며, 받는 보호막과 회복 효과가 감소합니다.',
        styledDescription: '<span class="stat-gold">퀘스트:</span> 적 챔피언 <span class="stat-trigger">처치 관여</span> 18회를 달성해야 합니다.<br><span class="stat-gold">보상:</span> 퀘스트를 완료하면 <b>황금 뒤집개</b>를 획득합니다.<br><br><b>[황금 뒤집개 스탯]</b><br>• <span class="stat-ad">공격력 +90</span> | <span class="stat-ap">주문력 +110</span> | <span class="stat-speed">공격 속도 +40%</span><br>• <span class="stat-crit">치명타 확률 +15%</span> | <span class="stat-hp">체력 +200</span> | <span class="stat-armor">방어력 +20</span><br>• <span class="stat-mr">마법 저항력 +20</span> | <span class="stat-speed">스킬 가속 +20</span> | <span class="stat-speed">이동 속도 +10%</span><br>• <span class="stat-vamp">생명력 흡수 +10%</span> | <span class="stat-hp">체력 재생 +50%</span> | 마나 재생 +100%<br><br><b>[고유 지속 효과 - 불이야!]</b><br>• 근처 적에게 <span class="stat-ap">화상 효과</span>를 적용하고 <span class="stat-speed">스킬 재사용 대기시간</span>이 감소합니다.<br>• 적 챔피언을 향해 이동할 때 <span class="stat-speed">이동 속도</span>가 증가하고 <span class="stat-speed">공격 속도</span> 및 마나 재생 속도가 증가합니다.<br>• <span style="color:#f87171;">[패널티]</span> 입는 피해량이 증가하며, 받는 보호막과 회복 효과가 감소합니다.',
        rarity: 'kPrismatic',
        rarityLabel: '프리즘',
        rarityCode: 'prismatic',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/kiwi/augments/icons/quest_urfschampion_small.png'
      },
      1154: {
        id: 1154,
        name: '우르프의 챔피언',
        description: '퀘스트: 적 챔피언 처치 관여 18회를 달성해야 합니다.\n보상: 퀘스트를 완료하면 황금 뒤집개를 획득합니다.\n\n[황금 뒤집개 효과]\n공격력 +90, 주문력 +110, 공격 속도 +40%, 치명타 확률 +15%, 체력 +200, 방어력 +20, 마법 저항력 +20, 마나 +200, 스킬 가속 +20, 이동 속도 +10%, 생명력 흡수 +10%, 기본 체력 재생 +50%, 기본 마나 재생 +100%\n\n고유 지속 효과 - 불이야!:\n근처 적에게 화상 효과를 적용하고 스킬 재사용 대기시간이 감소합니다. 적 챔피언을 향해 이동할 때 이동 속도가 증가하고 공격 속도 및 마나 재생 속도가 증가합니다. 하지만 입는 피해량이 증가하며, 받는 보호막과 회복 효과가 감소합니다.',
        styledDescription: '<span class="stat-gold">퀘스트:</span> 적 챔피언 <span class="stat-trigger">처치 관여</span> 18회를 달성해야 합니다.<br><span class="stat-gold">보상:</span> 퀘스트를 완료하면 <b>황금 뒤집개</b>를 획득합니다.<br><br><b>[황금 뒤집개 스탯]</b><br>• <span class="stat-ad">공격력 +90</span> | <span class="stat-ap">주문력 +110</span> | <span class="stat-speed">공격 속도 +40%</span><br>• <span class="stat-crit">치명타 확률 +15%</span> | <span class="stat-hp">체력 +200</span> | <span class="stat-armor">방어력 +20</span><br>• <span class="stat-mr">마법 저항력 +20</span> | <span class="stat-speed">스킬 가속 +20</span> | <span class="stat-speed">이동 속도 +10%</span><br>• <span class="stat-vamp">생명력 흡수 +10%</span> | <span class="stat-hp">체력 재생 +50%</span> | 마나 재생 +100%<br><br><b>[고유 지속 효과 - 불이야!]</b><br>• 근처 적에게 <span class="stat-ap">화상 효과</span>를 적용하고 <span class="stat-speed">스킬 재사용 대기시간</span>이 감소합니다.<br>• 적 챔피언을 향해 이동할 때 <span class="stat-speed">이동 속도</span>가 증가하고 <span class="stat-speed">공격 속도</span> 및 마나 재생 속도가 증가합니다.<br>• <span style="color:#f87171;">[패널티]</span> 입는 피해량이 증가하며, 받는 보호막과 회복 효과가 감소합니다.',
        rarity: 'kPrismatic',
        rarityLabel: '프리즘',
        rarityCode: 'prismatic',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/kiwi/augments/icons/quest_urfschampion_small.png'
      }
    };

    for (const [id, cAug] of Object.entries(customAugs)) {
      if (!isNaN(id)) {
        this.augments[id] = cAug;
      }
      this.dexAugments[cAug.name] = cAug;
    }
  }

  // 2. 챔피언 목록 로드
  async loadChampions() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/champion-summary.json';
    const list = await this.fetchWithCache('champion-summary.json', url);
    if (Array.isArray(list)) {
      list.forEach(champ => {
        if (champ.id === -1) return;
        const iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champ.id}.png`;
        this.champions[champ.id] = {
          id: champ.id,
          name: champ.name,
          alias: champ.alias,
          squarePortraitPath: iconUrl
        };
      });
    }
  }

  // 3. 아이템 목록 로드
  async loadItems() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/items.json';
    const list = await this.fetchWithCache('items.json', url);
    if (Array.isArray(list)) {
      list.forEach(item => {
        let iconUrl = '';
        if (item.iconPath) {
          const cleanPath = item.iconPath.toLowerCase().replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        this.items[item.id] = {
          id: item.id,
          name: item.name,
          description: item.description,
          iconUrl: iconUrl || `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${item.id}.png`
        };
      });
    }

    // 특수 신규 모드 아이템 수동 매핑 (궁극의 히드라, 우글렛 등)
    const customItems = {
      226668: {
        id: 226668,
        name: '궁극의 히드라',
        description: '공격력 200, 스킬 가속 25, 물리 관통력 25, 체력 1000, 모든 피해 흡혈 15%',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/items/icons2d/kiwi/aram_ultimatehydra_64.png'
      },
      6668: {
        id: 6668,
        name: '궁극의 히드라',
        description: '공격력 200, 스킬 가속 25, 물리 관통력 25, 체력 1000, 모든 피해 흡혈 15%',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/items/icons2d/kiwi/aram_ultimatehydra_64.png'
      },
      228002: {
        id: 228002,
        name: '우글렛의 마녀 모자',
        description: '주문력 300, 방어력 50, 스킬 가속 20',
        iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/items/icons2d/3385_forge_wooglets_witchcap.png'
      }
    };
    for (const [id, cItem] of Object.entries(customItems)) {
      this.items[id] = cItem;
    }
  }

  // 4. 소환사 주문 로드
  async loadSpells() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/summoner-spells.json';
    const list = await this.fetchWithCache('summoner-spells.json', url);
    if (Array.isArray(list)) {
      list.forEach(spell => {
        let iconUrl = '';
        if (spell.iconPath) {
          const cleanPath = spell.iconPath.toLowerCase().replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        this.spells[spell.id] = {
          id: spell.id,
          name: spell.name,
          description: spell.description,
          iconUrl
        };
      });
    }
  }

  // 5. 룬 로드
  async loadPerks() {
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/ko_kr/v1/perks.json';
    const list = await this.fetchWithCache('perks.json', url);
    if (Array.isArray(list)) {
      list.forEach(perk => {
        let iconUrl = '';
        if (perk.iconPath) {
          const cleanPath = perk.iconPath.toLowerCase().replace('/lol-game-data/assets/', '');
          iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
        }
        this.perks[perk.id] = {
          id: perk.id,
          name: perk.name,
          iconUrl
        };
      });
    }
  }

  // 증강체 정보 조회
  getAugment(id) {
    if (!id || id <= 0) return null;
    return this.augments[id] || {
      id,
      name: `증강체 (#${id})`,
      description: '알 수 없는 증강체',
      styledDescription: '알 수 없는 증강체',
      rarity: 'kSilver',
      rarityLabel: '실버',
      rarityCode: 'silver',
      iconUrl: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/0.jpg'
    };
  }

  // 챔피언 정보 조회
  getChampion(id) {
    return this.champions[id] || {
      id,
      name: `챔피언 #${id}`,
      alias: 'Unknown',
      squarePortraitPath: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`
    };
  }

  // 아이템 정보 조회
  getItem(id) {
    if (!id || id <= 0) return null;
    return this.items[id] || {
      id,
      name: `아이템 #${id}`,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${id}.png`
    };
  }

  // 스펠 정보 조회
  getSpell(id) {
    return this.spells[id] || {
      id,
      name: `스펠 #${id}`,
      iconUrl: ''
    };
  }

  // 저장/전송용 경량 포맷: 챔피언·아이템·스펠·증강체는 ID만 남기고 팀 중복 배열 제거
  // (풍부화된 게임/이미 압축된 게임 모두 입력 가능 → 기존 저장 파일 자동 마이그레이션)
  compactGame(game) {
    if (!game || game.isGap) return game;
    const { team100, team200, targetParticipant, participants = [], ...rest } = game;
    return {
      ...rest,
      participants: participants.map(p => {
        const { champion, spells, items, augments, ...pRest } = p;
        return {
          ...pRest,
          championId: pRest.championId ?? champion?.id ?? 0,
          spellIds: pRest.spellIds || (spells || []).map(s => s?.id || 0),
          itemIds: pRest.itemIds || (items || []).map(it => it?.id || 0),
          augmentIds: pRest.augmentIds || (augments || []).map(a => a?.id).filter(Boolean)
        };
      })
    };
  }

  // 게임 목록에 등장하는 메타데이터만 추려서 반환 (클라이언트가 ID → 객체로 복원)
  buildMetaFor(games) {
    const out = { champions: {}, items: {}, spells: {}, augments: {} };
    for (const g of games) {
      if (!g || g.isGap) continue;
      for (const p of g.participants || []) {
        if (!out.champions[p.championId]) out.champions[p.championId] = this.getChampion(p.championId);
        for (const id of p.spellIds || []) {
          if (id && !out.spells[id]) {
            const { id: sid, name, iconUrl } = this.getSpell(id);
            out.spells[id] = { id: sid, name, iconUrl };
          }
        }
        for (const id of p.itemIds || []) {
          if (id > 0 && !out.items[id]) {
            const { id: iid, name, iconUrl } = this.getItem(id);
            out.items[id] = { id: iid, name, iconUrl };
          }
        }
        for (const id of p.augmentIds || []) {
          if (id > 0 && !out.augments[id]) out.augments[id] = this.getAugment(id);
        }
      }
    }
    return out;
  }

  // 게임 상세 데이터 풍부화(Enrichment)
  enrichGameData(game, targetPuuid = null) {
    if (!game) return null;

    // 솔랭(420), 자랭(440), 일반(400, 430), 봇전(830-850) 등은 명확히 제외
    const standardExcludes = [420, 440, 400, 430, 830, 840, 850, 490];
    if (standardExcludes.includes(game.queueId)) {
      return null;
    }

    // 참가자 ID 매핑
    const participantIdentities = game.participantIdentities || [];
    const idToSummoner = {};
    participantIdentities.forEach(pi => {
      idToSummoner[pi.participantId] = {
        summonerName: pi.player?.summonerName || pi.player?.gameName || '소환사',
        gameName: pi.player?.gameName || '',
        tagLine: pi.player?.tagLine || '',
        puuid: pi.player?.puuid || '',
        profileIcon: pi.player?.profileIcon || 0
      };
    });

    let maxDamage = 0;
    let maxDamageTaken = 0;
    let maxHeal = 0;
    let targetParticipant = null;

    // 참가자 정보 가공
    const participants = (game.participants || []).map(p => {
      const stats = p.stats || {};
      const summoner = idToSummoner[p.participantId] || {};
      const champ = this.getChampion(p.championId);

      // 증강체 추출 (playerAugment1~6 또는 stats.playerAugment 배열)
      const augmentIds = [];
      for (let i = 1; i <= 6; i++) {
        const augId = stats[`playerAugment${i}`] || (stats.playerAugments && stats.playerAugments[i - 1]);
        if (augId && augId > 0) {
          augmentIds.push(augId);
        }
      }
      const augments = augmentIds.map(id => this.getAugment(id)).filter(Boolean);

      // 아이템 추출 (item0 ~ item6)
      const items = [];
      for (let i = 0; i <= 6; i++) {
        const itemId = stats[`item${i}`];
        items.push(this.getItem(itemId));
      }

      // 스펠 추출
      const spell1 = this.getSpell(p.spell1Id);
      const spell2 = this.getSpell(p.spell2Id);

      const totalDamage = stats.totalDamageDealtToChampions || 0;
      const physicalDamage = stats.physicalDamageDealtToChampions || 0;
      const magicDamage = stats.magicDamageDealtToChampions || 0;
      const trueDamage = stats.trueDamageDealtToChampions || 0;
      const totalDamageTaken = stats.totalDamageTaken || 0;
      const totalHeal = (stats.totalHeal || 0) + (stats.totalDamageShieldedOnTeammates || 0);

      // 물리/마법/고정 비율 계산
      const physicalDamagePercent = totalDamage > 0 ? Math.round((physicalDamage / totalDamage) * 100) : 0;
      const magicDamagePercent = totalDamage > 0 ? Math.round((magicDamage / totalDamage) * 100) : 0;
      const trueDamagePercent = totalDamage > 0 ? Math.max(0, 100 - physicalDamagePercent - magicDamagePercent) : 0;

      if (totalDamage > maxDamage) maxDamage = totalDamage;
      if (totalDamageTaken > maxDamageTaken) maxDamageTaken = totalDamageTaken;
      if (totalHeal > maxHeal) maxHeal = totalHeal;

      const participantData = {
        participantId: p.participantId,
        teamId: p.teamId,
        summonerName: summoner.summonerName,
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        puuid: summoner.puuid,
        champion: champ,
        champLevel: stats.champLevel || 1,
        win: stats.win === true || stats.win === 1,
        kills: stats.kills || 0,
        deaths: stats.deaths || 0,
        assists: stats.assists || 0,
        kda: stats.deaths === 0 ? ((stats.kills + stats.assists)).toFixed(2) : ((stats.kills + stats.assists) / stats.deaths).toFixed(2),
        totalDamage,
        physicalDamage,
        magicDamage,
        trueDamage,
        physicalDamagePercent,
        magicDamagePercent,
        trueDamagePercent,
        totalDamageTaken,
        totalHeal,
        goldEarned: stats.goldEarned || 0,
        minionsKilled: (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0),
        spells: [spell1, spell2],
        items,
        augments,
        augmentIds,
        isLeaver: Boolean(stats.leaver || stats.causedEarlySurrender),
        causedEarlySurrender: Boolean(stats.causedEarlySurrender),
        earlySurrender: Boolean(stats.earlySurrender || stats.gameEndedInEarlySurrender),
        isTarget: targetPuuid ? summoner.puuid === targetPuuid : false,
        // 추가 스탯 (LCU는 최근 약 40경기만 제공하므로 지금부터 모아 둠)
        ext: Object.fromEntries(EXTRA_STAT_KEYS.map(k => [k, Number(stats[k]) || 0]))
      };

      if (participantData.isTarget) {
        targetParticipant = participantData;
      }

      return participantData;
    });

    // 다시하기(Remake) 여부 판별 (5분 미만 조기 종료 또는 earlySurrender 플래그 감지)
    const isRemake = Boolean(
      game.gameEndedInEarlySurrender === true ||
      participants.some(p => p.causedEarlySurrender || p.earlySurrender) ||
      (game.gameDuration > 0 && game.gameDuration < 240)
    );

    if (targetParticipant) {
      targetParticipant.isRemake = isRemake;
    }

    // 딜량/받은피해/회복 비율 및 1위 표시
    participants.forEach(p => {
      p.isRemake = isRemake;
      p.damagePercent = maxDamage > 0 ? Math.round((p.totalDamage / maxDamage) * 100) : 0;
      p.damageTakenPercent = maxDamageTaken > 0 ? Math.round((p.totalDamageTaken / maxDamageTaken) * 100) : 0;
      p.healPercent = maxHeal > 0 ? Math.round((p.totalHeal / maxHeal) * 100) : 0;
      p.isHighestDamage = p.totalDamage === maxDamage && maxDamage > 0;
    });

    // 팀 분리 (100: 블루팀, 200: 레드팀)
    const team100 = participants.filter(p => p.teamId === 100);
    const team200 = participants.filter(p => p.teamId === 200);

    // 팀 총 킬수 계산 (킬관여율 계산용)
    const team100Kills = team100.reduce((sum, p) => sum + p.kills, 0);
    const team200Kills = team200.reduce((sum, p) => sum + p.kills, 0);

    participants.forEach(p => {
      const teamKills = p.teamId === 100 ? team100Kills : team200Kills;
      p.killParticipation = teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
    });

    // [중요] 증강체 모드(아수라장 / 아레나) 유효성 검증
    // 1. 전체 참가자의 증강체 획득 총합 계산
    const totalAugmentsCount = participants.reduce((sum, p) => sum + (p.augments?.length || 0), 0);

    // 2. 공식 아수라장 큐(2400, 2450)나 공식 아레나 큐(1700, 1710)가 아니면서 증강체가 0개인 판은 배제
    const isOfficialAugmentQueue = [2400, 2450, 1700, 1710].includes(game.queueId);
    if (totalAugmentsCount === 0 && !isOfficialAugmentQueue) {
      return null;
    }

    // 3. 사용자 지정 게임(CUSTOM_GAME)인데 증강체가 0개이거나 맵이 칼바람(12)/사투의전장(30)이 아니면 배제
    if (game.gameType === 'CUSTOM_GAME' && (totalAugmentsCount === 0 || ![12, 30].includes(game.mapId))) {
      return null;
    }

    // 모드 판별 (아레나 vs 아수라장 클래식 vs 아수라장)
    // 1. 아레나 판별 (CHERRY 모드 / 큐 1700, 1710 / 맵 30)
    const isArena = game.gameMode === 'CHERRY' ||
      game.queueId === 1700 ||
      game.queueId === 1710 ||
      game.mapId === 30 ||
      (game.subType && typeof game.subType === 'string' && game.subType.toUpperCase().includes('CHERRY')) ||
      (game.gameModeName && typeof game.gameModeName === 'string' && game.gameModeName.includes('아레나'));

    // 2. 아수라장 클래식 판별 (KIWI_JADE / 큐 2450 / CLASSIC)
    const isMayhemClassic = !isArena && (
      game.isMayhemClassic === true ||
      game.gameMode === 'KIWI_JADE' ||
      game.queueId === 2450 ||
      game.gameType === 'CLASSIC' || 
      game.gameMode === 'CLASSIC' || 
      (game.subType && typeof game.subType === 'string' && game.subType.toUpperCase().includes('CLASSIC')) ||
      (game.gameModeName && typeof game.gameModeName === 'string' && game.gameModeName.includes('클래식'))
    );

    // 3. 최종 모드 명칭 부여
    let modeName = '아수라장';
    if (isArena) {
      modeName = '아레나';
    } else if (isMayhemClassic) {
      modeName = '아수라장 클래식';
    }

    return {
      gameId: game.gameId,
      gameCreation: game.gameCreation,
      gameDuration: game.gameDuration,
      gameVersion: game.gameVersion,
      gameMode: game.gameMode,
      gameType: game.gameType,
      queueId: game.queueId,
      isAramMayhem: !isArena,
      isArena,
      isMayhemClassic,
      isRemake,
      modeName,
      mapId: game.mapId,
      targetParticipant,
      participants,
      team100,
      team200,
      team100Win: team100.length > 0 && team100[0].win,
      team200Win: team200.length > 0 && team200[0].win,
      team100Kills,
      team200Kills
    };
  }
}

module.exports = new MetaManager();
