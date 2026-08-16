// 마음동네 — 데이터 & 설정
// 실제 서비스에서는 VOLUNTEER_DATA / SARANGBANG_SEED 부분을 서버 API 호출로 교체하면 됩니다.
// 마음포인트(points)는 CLAUDE.md 규칙에 따라 활동당 0~200, hours*30 상한으로 계산합니다.

(function () {
  function pointsFor(hours) {
    return Math.min(200, Math.round((hours || 0) * 30));
  }

  // ===== 동네 봉사활동 =====
  const activities = [
    {
      id: "v1",
      category: "환경",
      title: "한강공원 플로깅 - 쓰레기 줍기 봉사",
      org: "서울그린봉사단",
      region: "서울 영등포구",
      date: "2026-08-23",
      time: "09:00 ~ 12:00",
      hours: 3,
      capacity: 30,
      applied: 18,
      deadline: "2026-08-20",
      desc:
        "여의도 한강공원 일대를 걸으며 쓰레기를 줍는 플로깅 봉사입니다.\n\n" +
        "· 준비물: 편한 복장, 운동화, 개인 물병\n" +
        "· 봉사용 장갑과 집게, 봉투는 제공됩니다.\n" +
        "· 활동 후 마음확인증을 발급해 드립니다.\n" +
        "· 우천 시 다음 주 동일 시간으로 순연됩니다.",
    },
    {
      id: "v2",
      category: "어르신",
      title: "요양원 어르신 말벗 및 식사보조",
      org: "햇살요양원",
      region: "경기 성남시 분당구",
      date: "2026-08-18",
      time: "13:00 ~ 16:00",
      hours: 3,
      capacity: 8,
      applied: 6,
      deadline: "2026-08-16",
      desc:
        "요양원 어르신들과 대화를 나누고 간단한 식사 보조를 돕는 봉사입니다.\n\n" +
        "· 어르신을 존중하는 마음이 가장 중요합니다.\n" +
        "· 사전 오리엔테이션 15분 진행 후 활동 시작합니다.\n" +
        "· 감염 예방을 위해 마스크 착용 필수입니다.",
    },
    {
      id: "v3",
      category: "아동",
      title: "지역아동센터 초등학생 학습 멘토링",
      org: "꿈나무지역아동센터",
      region: "서울 관악구",
      date: "2026-08-25",
      time: "15:00 ~ 17:00",
      hours: 2,
      capacity: 12,
      applied: 4,
      deadline: "2026-08-22",
      desc:
        "초등학생들의 방과 후 학습을 도와주는 멘토링 봉사입니다.\n\n" +
        "· 국어, 수학 등 기초 과목 학습 지도\n" +
        "· 아이들과 눈높이를 맞춰 소통해 주세요.\n" +
        "· 정기 봉사 전환도 가능합니다.",
    },
    {
      id: "v4",
      category: "동물",
      title: "유기동물 보호소 청소 및 산책 봉사",
      org: "행복한발자국 보호소",
      region: "경기 김포시",
      date: "2026-08-24",
      time: "10:00 ~ 13:00",
      hours: 3,
      capacity: 15,
      applied: 15,
      deadline: "2026-08-21",
      desc:
        "유기견·유기묘 보호소에서 견사 청소와 강아지 산책을 돕는 봉사입니다.\n\n" +
        "· 동물을 무서워하지 않는 분이면 누구나 환영합니다.\n" +
        "· 물릴 수 있으니 안전 수칙을 꼭 지켜 주세요.\n" +
        "· 활동 후 손 세척 필수.",
    },
    {
      id: "v5",
      category: "환경",
      title: "도심 텃밭 가꾸기 & 화단 정비",
      org: "마을가꿈이",
      region: "서울 마포구",
      date: "2026-08-30",
      time: "09:30 ~ 11:30",
      hours: 2,
      capacity: 20,
      applied: 9,
      deadline: "2026-08-27",
      desc:
        "마을 공동 텃밭에서 잡초를 뽑고 화단을 정비하는 봉사입니다.\n\n" +
        "· 초보자도 쉽게 참여할 수 있습니다.\n" +
        "· 장갑, 호미 등 도구 제공\n" +
        "· 수확 철에는 작물 나눔도 함께 합니다.",
    },
    {
      id: "v6",
      category: "재능기부",
      title: "복지관 어르신 스마트폰 사용법 교육",
      org: "이웃사랑종합복지관",
      region: "인천 남동구",
      date: "2026-09-02",
      time: "14:00 ~ 16:00",
      hours: 2,
      capacity: 10,
      applied: 3,
      deadline: "2026-08-29",
      desc:
        "어르신들께 스마트폰 기본 사용법을 알려드리는 재능기부 봉사입니다.\n\n" +
        "· 카카오톡, 사진 촬영, 앱 설치 등 기초 위주\n" +
        "· 천천히, 반복해서 설명해 주실 분을 찾습니다.\n" +
        "· 1:1 또는 1:2로 진행됩니다.",
    },
    {
      id: "v7",
      category: "아동",
      title: "저소득층 아동 도시락 배달 봉사",
      org: "나눔의밥상",
      region: "서울 노원구",
      date: "2026-08-19",
      time: "11:00 ~ 13:00",
      hours: 2,
      capacity: 16,
      applied: 11,
      deadline: "2026-08-17",
      desc:
        "결식 우려 아동 가정에 도시락을 배달하는 봉사입니다.\n\n" +
        "· 2인 1조로 배달합니다.\n" +
        "· 도보 및 대중교통 이동이 있습니다.\n" +
        "· 따뜻한 인사 한마디가 큰 힘이 됩니다.",
    },
    {
      id: "v8",
      category: "어르신",
      title: "독거어르신 안부 확인 전화 봉사",
      org: "온기나눔센터",
      region: "재택 가능",
      date: "2026-09-05",
      time: "자율 (주 2회)",
      hours: 2,
      capacity: 25,
      applied: 7,
      deadline: "2026-09-01",
      desc:
        "홀로 지내는 어르신께 주기적으로 안부 전화를 드리는 비대면 봉사입니다.\n\n" +
        "· 집에서 참여할 수 있습니다.\n" +
        "· 사전 교육(온라인 40분) 이수 후 활동\n" +
        "· 따뜻하게 경청해 주실 분을 찾습니다.",
    },
  ];
  // 활동마다 마음포인트 부여
  activities.forEach((a) => (a.points = pointsFor(a.hours)));
  window.VOLUNTEER_DATA = activities;

  // ===== 사랑방 시드 =====
  // CLAUDE.md 원칙: 기본값은 '활동 제안'(이거 같이 해볼래?). 제안글은 제목 필수 + '같이할래요'.
  window.SARANGBANG_SEED = [
    {
      id: "p1",
      type: "proposal", // proposal(활동 제안) | free(자유글)
      title: "주말에 연남동 골목 담배꽁초 같이 주우실 분!",
      body:
        "동네 산책하다 보면 골목에 꽁초가 너무 많더라고요.\n" +
        "이번 토요일 오전에 커피 한 잔 하고 30분만 같이 주워요. 집게는 제가 챙길게요!",
      author: "연남토박이",
      region: "서울 마포구 연남동",
      createdAt: "2026-08-12T09:20:00",
      wantCount: 4,
      joinedBy: ["연남토박이", "초록발자국", "산책러"],
    },
    {
      id: "p2",
      type: "proposal",
      title: "경로당 어르신들 사진 찍어드리기 (영정말고 예쁜 사진!)",
      body:
        "핸드폰으로 어르신들 밝게 웃는 사진 찍어드리고 인화해서 액자로 드리고 싶어요.\n" +
        "사진 조금 찍을 줄 아시는 분, 인화 도와주실 분 함께해요.",
      author: "김사진",
      region: "서울 마포구 연남동",
      createdAt: "2026-08-13T14:05:00",
      wantCount: 6,
      joinedBy: ["김사진", "렌즈굽는사람", "따뜻한손", "동네주민A", "봄날", "연남토박이"],
    },
    {
      id: "p3",
      type: "free",
      title: "",
      body:
        "지난주 한강 플로깅 다녀왔어요. 생각보다 금방 끝나고 뿌듯하더라고요 :)\n" +
        "마음확인증 받으니까 괜히 더 기분 좋았어요. 다들 파이팅!",
      author: "초록발자국",
      region: "서울 마포구 연남동",
      createdAt: "2026-08-13T20:41:00",
      wantCount: 0,
      joinedBy: [],
    },
  ];

  // ===== 설정 상수 =====
  window.MD_CONFIG = {
    // 데모 기준일 (실제 배포 시 new Date() 로 교체)
    today: "2026-08-14",
    // 데모 사용자 (name 은 가입 시 닉네임으로 대체)
    me: { name: "이웃", region: "서울 마포구 연남동" },
    // 시(구) — 현재는 마포구 기준
    district: "서울 마포구",
    // 동(洞) 목록 — brightness: 밤하늘 밝기(0~100), lanterns: 봉사 등불 갯수, donations: 이웃 기금(원), lat/lng: 위치정렬
    dongs: [
      { name: "연남동", brightness: 66, lanterns: 342, donations: 1240000, lat: 37.5626, lng: 126.9250 },
      { name: "망원동", brightness: 74, lanterns: 511, donations: 2050000, lat: 37.5556, lng: 126.9020 },
      { name: "서교동", brightness: 61, lanterns: 287, donations: 980000, lat: 37.5540, lng: 126.9190 },
      { name: "성산동", brightness: 52, lanterns: 196, donations: 640000, lat: 37.5665, lng: 126.9100 },
      { name: "합정동", brightness: 45, lanterns: 154, donations: 520000, lat: 37.5495, lng: 126.9130 },
      { name: "공덕동", brightness: 57, lanterns: 233, donations: 870000, lat: 37.5445, lng: 126.9515 },
      { name: "대흥동", brightness: 49, lanterns: 178, donations: 610000, lat: 37.5480, lng: 126.9430 },
      { name: "염리동", brightness: 41, lanterns: 121, donations: 430000, lat: 37.5505, lng: 126.9370 },
      { name: "도화동", brightness: 33, lanterns: 88, donations: 280000, lat: 37.5395, lng: 126.9490 },
      { name: "상암동", brightness: 38, lanterns: 96, donations: 350000, lat: 37.5790, lng: 126.8890 },
    ],
    // 이웃 기금 사용처 — 모인 기금으로 앱 이웃들이 주기적으로 동네 봉사를 진행해요
    fundUses: [
      { emoji: "🍱", title: "독거 어르신 주간 도시락", cycle: "매주 토요일", cost: 150000 },
      { emoji: "🧹", title: "동네 골목 방역·대청소", cycle: "격주 일요일", cost: 90000 },
      { emoji: "📚", title: "아동 학습 꾸러미 지원", cycle: "매월 첫째 주", cost: 200000 },
      { emoji: "🐾", title: "길고양이 겨울 급식소", cycle: "매주 수요일", cost: 60000 },
    ],
    // 기부 프리셋 (원) — 데모, 실제 결제 없음
    donationPresets: [1000, 5000, 10000, 30000],
    categories: ["전체", "환경", "어르신", "아동", "동물", "재능기부", "기타"],
    // 이웃 등급 (heart_points 기준) — 낮은 순
    levels: [
      { min: 0, name: "씨앗 이웃", emoji: "🌱" },
      { min: 60, name: "새싹 이웃", emoji: "🌿" },
      { min: 180, name: "햇살 이웃", emoji: "🌞" },
      { min: 400, name: "별빛 이웃", emoji: "✨" },
      { min: 800, name: "등대 이웃", emoji: "🗼" },
    ],
    // 밤 → 동트임 단계 (0~100) — 봉사·기부가 쌓일수록 동이 밝아져요
    brightnessStages: [
      { min: 0, name: "깜깜한 밤", emoji: "🌑" },
      { min: 30, name: "어스름 새벽", emoji: "🌌" },
      { min: 50, name: "동트는 하늘", emoji: "🌆" },
      { min: 70, name: "물드는 아침노을", emoji: "🌅" },
      { min: 88, name: "환하게 밝은 동네", emoji: "☀️" },
    ],
    // 밤 → 동트임 색상 스케일 (밝기값 → 색). 사이값은 보간합니다.
    dawnScale: [
      { at: 0, color: [11, 16, 38] },     // 깊은 밤 (남색 검정)
      { at: 25, color: [36, 26, 77] },    // 어스름 (인디고)
      { at: 45, color: [91, 42, 107] },   // 여명 (보라)
      { at: 62, color: [168, 63, 91] },   // 동틈 (장밋빛)
      { at: 78, color: [232, 102, 59] },  // 노을 (주황)
      { at: 90, color: [245, 166, 35] },  // 아침 (황금)
      { at: 100, color: [255, 210, 122] } // 환한 아침
    ],
  };
})();
