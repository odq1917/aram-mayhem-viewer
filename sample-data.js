// 롤 클라이언트 미실행 시 데모/오프라인 테스트용 실제 규격 증강 칼바람 샘플 데이터
module.exports = {
  sampleSummoner: {
    gameName: "칼바람장인",
    tagLine: "KR1",
    displayName: "칼바람장인#KR1",
    puuid: "sample-puuid-mayhem-pro-12345",
    profileIconId: 588,
    summonerLevel: 342
  },

  // 1. 이번 검색에서 가져온 최신 실시간 경기들 (최근 1~2시간 전)
  sampleLiveGames: [
    {
      gameId: 7012345678,
      gameCreation: Date.now() - (1000 * 60 * 45), // 45분 전
      gameDuration: 1180, // 19분 40초
      gameMode: "ARAM",
      gameType: "MATCHED_GAME",
      queueId: 2400,
      mapId: 12,
      participantIdentities: [
        { participantId: 1, player: { gameName: "칼바람장인", tagLine: "KR1", puuid: "sample-puuid-mayhem-pro-12345", profileIcon: 588 } },
        { participantId: 2, player: { gameName: "제이스원챔", tagLine: "KR1", puuid: "p2", profileIcon: 512 } },
        { participantId: 3, player: { gameName: "포킹마스터", tagLine: "KR1", puuid: "p3", profileIcon: 520 } },
        { participantId: 4, player: { gameName: "눈덩이배달부", tagLine: "KR1", puuid: "p4", profileIcon: 531 } },
        { participantId: 5, player: { gameName: "힐러장인", tagLine: "KR1", puuid: "p5", profileIcon: 540 } },
        { participantId: 6, player: { gameName: "증강학자", tagLine: "KR1", puuid: "p6", profileIcon: 550 } },
        { participantId: 7, player: { gameName: "어둠의칼날", tagLine: "KR1", puuid: "p7", profileIcon: 560 } },
        { participantId: 8, player: { gameName: "칼바람불패", tagLine: "KR1", puuid: "p8", profileIcon: 570 } },
        { participantId: 9, player: { gameName: "탱커의자존심", tagLine: "KR1", puuid: "p9", profileIcon: 580 } },
        { participantId: 10, player: { gameName: "궁극기원툴", tagLine: "KR1", puuid: "p10", profileIcon: 590 } }
      ],
      participants: [
        {
          participantId: 1,
          teamId: 100,
          championId: 222, // 징크스
          spell1Id: 4,
          spell2Id: 32,
          stats: {
            win: true,
            champLevel: 18,
            kills: 24,
            deaths: 6,
            assists: 18,
            totalDamageDealtToChampions: 78540,
            totalDamageTaken: 22400,
            totalHeal: 3500,
            goldEarned: 21500,
            totalMinionsKilled: 85,
            item0: 3031, item1: 3046, item2: 3072, item3: 3036, item4: 3094, item5: 3006, item6: 3340,
            playerAugment1: 1115, // 최상급 조준경 부착 (Prismatic)
            playerAugment2: 1225, // 양손잡이 (Prismatic)
            playerAugment3: 1071, // 상급 조준경 부착 (Gold)
            playerAugment4: 1081  // 탭 댄서 (Prismatic)
          }
        },
        {
          participantId: 2, teamId: 100, championId: 126, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 17, kills: 14, deaths: 8, assists: 22, totalDamageDealtToChampions: 52100, totalDamageTaken: 28900, totalHeal: 1200, goldEarned: 16800, item0: 3142, item1: 6692, item2: 3071, item3: 3004, item4: 3158, item5: 0, item6: 3340, playerAugment1: 1113, playerAugment2: 1084, playerAugment3: 1133, playerAugment4: 1082 }
        },
        {
          participantId: 3, teamId: 100, championId: 99, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 16, kills: 8, deaths: 5, assists: 29, totalDamageDealtToChampions: 43200, totalDamageTaken: 15400, totalHeal: 8900, goldEarned: 15200, item0: 6655, item1: 3089, item2: 4645, item3: 3157, item4: 3020, item5: 0, item6: 3340, playerAugment1: 2087, playerAugment2: 1048, playerAugment3: 1030, playerAugment4: 1198 }
        },
        {
          participantId: 4, teamId: 100, championId: 875, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 17, kills: 11, deaths: 10, assists: 20, totalDamageDealtToChampions: 38400, totalDamageTaken: 62000, totalHeal: 14500, goldEarned: 16000, item0: 3084, item1: 3068, item2: 3748, item3: 3075, item4: 3047, item5: 0, item6: 3340, playerAugment1: 1041, playerAugment2: 1018, playerAugment3: 1001, playerAugment4: 1152 }
        },
        {
          participantId: 5, teamId: 100, championId: 40, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 16, kills: 2, deaths: 3, assists: 42, totalDamageDealtToChampions: 14200, totalDamageTaken: 12000, totalHeal: 28400, goldEarned: 13500, item0: 6617, item1: 3504, item2: 3107, item3: 3158, item4: 0, item5: 0, item6: 3340, playerAugment1: 1095, playerAugment2: 1141, playerAugment3: 1005, playerAugment4: 1037 }
        },
        {
          participantId: 6, teamId: 200, championId: 103, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 17, kills: 12, deaths: 11, assists: 14, totalDamageDealtToChampions: 48900, totalDamageTaken: 26000, totalHeal: 5400, goldEarned: 15400, item0: 6655, item1: 3089, item2: 3157, item3: 3020, item4: 4645, item5: 0, item6: 3340, playerAugment1: 1308, playerAugment2: 1088, playerAugment3: 1029, playerAugment4: 1036 }
        },
        {
          participantId: 7, teamId: 200, championId: 238, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 16, kills: 10, deaths: 13, assists: 8, totalDamageDealtToChampions: 36500, totalDamageTaken: 29800, totalHeal: 2100, goldEarned: 14200, item0: 3142, item1: 3814, item2: 3071, item3: 3158, item4: 0, item5: 0, item6: 3340, playerAugment1: 1006, playerAugment2: 1211, playerAugment3: 1082, playerAugment4: 1073 }
        },
        {
          participantId: 8, teamId: 200, championId: 81, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 16, kills: 5, deaths: 10, assists: 16, totalDamageDealtToChampions: 41200, totalDamageTaken: 21000, totalHeal: 1900, goldEarned: 13800, item0: 3078, item1: 3004, item2: 3153, item3: 3158, item4: 0, item5: 0, item6: 3340, playerAugment1: 1103, playerAugment2: 1129, playerAugment3: 1086, playerAugment4: 1022 }
        },
        {
          participantId: 9, teamId: 200, championId: 54, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 16, kills: 4, deaths: 12, assists: 18, totalDamageDealtToChampions: 29800, totalDamageTaken: 58000, totalHeal: 3100, goldEarned: 12900, item0: 3084, item1: 3068, item2: 3075, item3: 3111, item4: 0, item5: 0, item6: 3340, playerAugment1: 2006, playerAugment2: 1018, playerAugment3: 1057, playerAugment4: 1080 }
        },
        {
          participantId: 10, teamId: 200, championId: 25, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 15, kills: 2, deaths: 13, assists: 21, totalDamageDealtToChampions: 24300, totalDamageTaken: 28000, totalHeal: 4200, goldEarned: 11800, item0: 6653, item1: 3116, item2: 3157, item3: 3020, item4: 0, item5: 0, item6: 3340, playerAugment1: 1075, playerAugment2: 1045, playerAugment3: 1028, playerAugment4: 1044 }
        }
      ]
    },
    {
      gameId: 7012345677,
      gameCreation: Date.now() - (1000 * 60 * 120), // 2시간 전
      gameDuration: 1040,
      gameMode: "ARAM",
      gameType: "CLASSIC",
      isMayhemClassic: true,
      modeName: "아수라장 클래식",
      queueId: 2400,
      mapId: 12,
      participantIdentities: [
        { participantId: 1, player: { gameName: "칼바람장인", tagLine: "KR1", puuid: "sample-puuid-mayhem-pro-12345", profileIcon: 588 } },
        { participantId: 2, player: { gameName: "소나여신", tagLine: "KR1", puuid: "p2", profileIcon: 512 } },
        { participantId: 3, player: { gameName: "베인충탈출", tagLine: "KR1", puuid: "p3", profileIcon: 520 } },
        { participantId: 4, player: { gameName: "오른의모루", tagLine: "KR1", puuid: "p4", profileIcon: 531 } },
        { participantId: 5, player: { gameName: "카타궁대박", tagLine: "KR1", puuid: "p5", profileIcon: 540 } },
        { participantId: 6, player: { gameName: "니달리창술사", tagLine: "KR1", puuid: "p6", profileIcon: 550 } },
        { participantId: 7, player: { gameName: "마이엔딩", tagLine: "KR1", puuid: "p7", profileIcon: 560 } },
        { participantId: 8, player: { gameName: "신지드방구차", tagLine: "KR1", puuid: "p8", profileIcon: 570 } },
        { participantId: 9, player: { gameName: "바루스포킹", tagLine: "KR1", puuid: "p9", profileIcon: 580 } },
        { participantId: 10, player: { gameName: "소라카바나나", tagLine: "KR1", puuid: "p10", profileIcon: 590 } }
      ],
      participants: [
        {
          participantId: 1, teamId: 100, championId: 157, spell1Id: 4, spell2Id: 32,
          stats: {
            win: false, champLevel: 17, kills: 18, deaths: 12, assists: 14,
            totalDamageDealtToChampions: 61200, totalDamageTaken: 41000, totalHeal: 7800, goldEarned: 18200,
            item0: 3046, item1: 3031, item2: 3072, item3: 3006, item4: 3026, item5: 0, item6: 3340,
            playerAugment1: 1006, playerAugment2: 1047, playerAugment3: 1054, playerAugment4: 1081
          }
        },
        {
          participantId: 2, teamId: 100, championId: 37, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 15, kills: 3, deaths: 9, assists: 26, totalDamageDealtToChampions: 19800, totalDamageTaken: 18200, totalHeal: 31000, goldEarned: 12400, item0: 6617, item1: 3504, item2: 3158, item3: 3107, item4: 0, item5: 0, item6: 3340, playerAugment1: 1095, playerAugment2: 1030, playerAugment3: 1067, playerAugment4: 1037 }
        },
        {
          participantId: 3, teamId: 100, championId: 67, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 16, kills: 9, deaths: 11, assists: 11, totalDamageDealtToChampions: 38900, totalDamageTaken: 23100, totalHeal: 4100, goldEarned: 14500, item0: 3153, item1: 3124, item2: 3006, item3: 3046, item4: 0, item5: 0, item6: 3340, playerAugment1: 1225, playerAugment2: 1022, playerAugment3: 1087, playerAugment4: 1079 }
        },
        {
          participantId: 4, teamId: 100, championId: 516, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 16, kills: 2, deaths: 10, assists: 22, totalDamageDealtToChampions: 22400, totalDamageTaken: 68000, totalHeal: 2500, goldEarned: 13100, item0: 3084, item1: 3068, item2: 3075, item3: 3047, item4: 0, item5: 0, item6: 3340, playerAugment1: 1041, playerAugment2: 1018, playerAugment3: 1353, playerAugment4: 1080 }
        },
        {
          participantId: 5, teamId: 100, championId: 55, spell1Id: 4, spell2Id: 32,
          stats: { win: false, champLevel: 16, kills: 14, deaths: 13, assists: 9, totalDamageDealtToChampions: 44300, totalDamageTaken: 29000, totalHeal: 3800, goldEarned: 15100, item0: 3146, item1: 3157, item2: 3089, item3: 3020, item4: 0, item5: 0, item6: 3340, playerAugment1: 1088, playerAugment2: 1048, playerAugment3: 1214, playerAugment4: 1029 }
        },
        {
          participantId: 6, teamId: 200, championId: 76, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 18, kills: 19, deaths: 7, assists: 22, totalDamageDealtToChampions: 72400, totalDamageTaken: 20100, totalHeal: 14000, goldEarned: 20100, item0: 6655, item1: 3089, item2: 4645, item3: 3135, item4: 3020, item5: 3100, item6: 3340, playerAugment1: 1113, playerAugment2: 2087, playerAugment3: 1030, playerAugment4: 1086 }
        },
        {
          participantId: 7, teamId: 200, championId: 11, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 18, kills: 21, deaths: 9, assists: 12, totalDamageDealtToChampions: 67800, totalDamageTaken: 36000, totalHeal: 9200, goldEarned: 21400, item0: 3124, item1: 3153, item2: 6333, item3: 3006, item4: 3072, item5: 3026, item6: 3340, playerAugment1: 1006, playerAugment2: 1225, playerAugment3: 1079, playerAugment4: 1081 }
        },
        {
          participantId: 8, teamId: 200, championId: 27, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 17, kills: 5, deaths: 11, assists: 27, totalDamageDealtToChampions: 41200, totalDamageTaken: 74000, totalHeal: 5600, goldEarned: 15300, item0: 6653, item1: 3116, item2: 3084, item3: 3111, item4: 0, item5: 0, item6: 3340, playerAugment1: 1075, playerAugment2: 1045, playerAugment3: 1405, playerAugment4: 1023 }
        },
        {
          participantId: 9, teamId: 200, championId: 110, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 17, kills: 8, deaths: 8, assists: 25, totalDamageDealtToChampions: 49500, totalDamageTaken: 19000, totalHeal: 2100, goldEarned: 16100, item0: 3142, item1: 6692, item2: 3004, item3: 3036, item4: 3158, item5: 0, item6: 3340, playerAugment1: 1113, playerAugment2: 1133, playerAugment3: 1084, playerAugment4: 1086 }
        },
        {
          participantId: 10, teamId: 200, championId: 16, spell1Id: 4, spell2Id: 32,
          stats: { win: true, champLevel: 16, kills: 2, deaths: 11, assists: 34, totalDamageDealtToChampions: 12100, totalDamageTaken: 17500, totalHeal: 38500, goldEarned: 13900, item0: 6617, item1: 3504, item2: 3107, item3: 3158, item4: 0, item5: 0, item6: 3340, playerAugment1: 1095, playerAugment2: 1141, playerAugment3: 1005, playerAugment4: 1070 }
        }
      ]
    }
  ],

  // 2. 이전에 검색해서 저장해두었던 과거 경기들 (3일 전 / 5일 전 기록 - gap 시연용)
  sampleCachedPastGames: [
    {
      gameId: 7012345590,
      gameCreation: Date.now() - (1000 * 60 * 60 * 24 * 3), // 3일 전
      gameDuration: 1240, // 20분 40초
      gameMode: "ARAM",
      gameType: "MATCHED_GAME",
      queueId: 2400,
      mapId: 12,
      participantIdentities: [
        { participantId: 1, player: { gameName: "칼바람장인", tagLine: "KR1", puuid: "sample-puuid-mayhem-pro-12345", profileIcon: 588 } }
      ],
      participants: [
        {
          participantId: 1,
          teamId: 100,
          championId: 517, // 사일러스
          spell1Id: 4,
          spell2Id: 32,
          stats: {
            win: true,
            champLevel: 18,
            kills: 28,
            deaths: 9,
            assists: 21,
            totalDamageDealtToChampions: 84300,
            totalDamageTaken: 45000,
            totalHeal: 22000,
            goldEarned: 22800,
            totalMinionsKilled: 60,
            item0: 3157, item1: 3089, item2: 4645, item3: 3116, item4: 3020, item5: 6655, item6: 3340,
            playerAugment1: 1048, // 보석 건틀릿 (Prismatic)
            playerAugment2: 1088, // 궁극기 대변혁 (Prismatic)
            playerAugment3: 1045, // 지옥의 전도체 (Prismatic)
            playerAugment4: 1030  // 유레카 (Prismatic)
          }
        }
      ]
    },
    {
      gameId: 7012345550,
      gameCreation: Date.now() - (1000 * 60 * 60 * 24 * 5), // 5일 전
      gameDuration: 990, // 16분 30초
      gameMode: "ARAM",
      gameType: "MATCHED_GAME",
      queueId: 2400,
      mapId: 12,
      participantIdentities: [
        { participantId: 1, player: { gameName: "칼바람장인", tagLine: "KR1", puuid: "sample-puuid-mayhem-pro-12345", profileIcon: 588 } }
      ],
      participants: [
        {
          participantId: 1,
          teamId: 100,
          championId: 145, // 카이사
          spell1Id: 4,
          spell2Id: 32,
          stats: {
            win: true,
            champLevel: 17,
            kills: 19,
            deaths: 7,
            assists: 15,
            totalDamageDealtToChampions: 65400,
            totalDamageTaken: 19800,
            totalHeal: 4100,
            goldEarned: 19400,
            totalMinionsKilled: 75,
            item0: 3078, item1: 3004, item2: 3089, item3: 3115, item4: 3006, item5: 0, item6: 3340,
            playerAugment1: 1113, // 노련한 저격수 (Gold)
            playerAugment2: 1133, // 마법 미사일 (Gold)
            playerAugment3: 1086, // 정조준 일격 신동 (Prismatic)
            playerAugment4: 1084  // 바늘에 실 끼우기 (Gold)
          }
        }
      ]
    }
  ]
};
