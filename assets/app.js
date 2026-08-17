// 마음동네 — 앱 로직
// 동(洞) 단위 봉사 매칭 · 밤→동트임 밝기 · 마음확인증 · 사랑방 · 봉사 올리기
// 모든 상태는 localStorage 에 저장됩니다. (프로토타입 · 서버 없음)

(function () {
  "use strict";

  const CFG = window.MD_CONFIG;
  const ME = CFG.me;
  const TODAY = new Date(CFG.today + "T00:00:00");
  const STORE_KEY = "maeumdongne_v1";
  const CATS = CFG.categories;

  const DISCLAIMER =
    "이 마음확인증은 참여를 따뜻하게 기록하는 <b>비공식 확인증</b>이에요. " +
    "1365·VMS 등 공식 봉사시간 인증이 아니에요.";

  // ---------- 상태 ----------
  const persisted = loadStore();
  const state = {
    tab: "home",
    view: "list",
    detailId: null,
    certId: null,
    keyword: "",
    category: "전체",
    sbFilter: "전체",
    selectedDong: persisted.selectedDong || null, // 내가 밝히는 동
    profile: persisted.profile || { name: null, signedUp: false }, // 가입 정보
    applied: new Set(persisted.applied || []),
    attended: new Set(persisted.attended || []),
    certificates: persisted.certificates || [],
    joinedSeed: new Set(persisted.joinedSeed || []),
    userPosts: persisted.userPosts || [],
    myActivities: persisted.myActivities || [],
    managed: persisted.managed || {}, // 주최자 출석 관리: {actId:{applicants:[],done}}
    communityLanterns: persisted.communityLanterns || {}, // 동네별 이웃(NPC) 등불
    donatedByDong: persisted.donatedByDong || {}, // 내가 기부한 금액(동네별)
    saved: new Set(persisted.saved || []), // 찜한 봉사 id
    postComments: persisted.postComments || {}, // 사랑방 댓글 {postId:[{author,body,at}]}
    reviews: persisted.reviews || {}, // 봉사 후기 {activityId:{text,photo,at}}
    donationReceipts: persisted.donationReceipts || [], // 기부 영수증
    recurring: persisted.recurring || null, // 정기 기부 {amount,dong}
    postId: null,
  };

  let createForm = null;
  let composeForm = null;
  let obStep = 0;
  let obGeo = null; // {lat,lng}
  let obGeoState = "none"; // none | ok | denied
  let obGeoReq = false;

  const els = {
    view: document.getElementById("view"),
    tabbar: document.getElementById("tabbar"),
    toast: document.getElementById("toast"),
    fab: document.getElementById("fab"),
    mineBadge: document.getElementById("mine-badge"),
    certsBadge: document.getElementById("certs-badge"),
    headerRegion: document.getElementById("header-region"),
  };

  // Supabase Auth — 설정(supabase-config.js)이 채워지면 실제 소셜 로그인 동작, 아니면 데모
  const SB =
    window.supabase && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url
      ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey)
      : null;
  function authEnabled() {
    return !!SB;
  }
  async function checkAuthSession() {
    if (!SB) return;
    try {
      const { data } = await SB.auth.getSession();
      const user = data && data.session && data.session.user;
      if (user) {
        const meta = user.user_metadata || {};
        const nm =
          meta.name || meta.full_name || meta.nickname ||
          (user.email ? user.email.split("@")[0] : currentDong() + " 반디");
        state.profile = {
          name: nm,
          signedUp: true,
          provider: (user.app_metadata && user.app_metadata.provider) || "social",
        };
        if (!state.selectedDong) state.selectedDong = "연남동";
        saveStore();
        const ob = document.getElementById("onboarding");
        if (ob) ob.remove();
        render();
      }
    } catch (e) {}
  }

  // ---------- 저장소 ----------
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function saveStore() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          selectedDong: state.selectedDong,
          profile: state.profile,
          applied: [...state.applied],
          attended: [...state.attended],
          certificates: state.certificates,
          joinedSeed: [...state.joinedSeed],
          userPosts: state.userPosts,
          myActivities: state.myActivities,
          managed: state.managed,
          communityLanterns: state.communityLanterns,
          donatedByDong: state.donatedByDong,
          saved: [...state.saved],
          postComments: state.postComments,
          reviews: state.reviews,
          donationReceipts: state.donationReceipts,
          recurring: state.recurring,
        })
      );
    } catch (e) {}
  }

  // ---------- 동(洞) · 밝기 · 색 ----------
  function currentDong() {
    return state.selectedDong || "연남동";
  }
  function myRegion() {
    return CFG.district + " " + currentDong();
  }
  function dongInfo(name) {
    return CFG.dongs.find((d) => d.name === name) || { name, brightness: 40 };
  }
  function myBrightnessShare() {
    return state.attended.size * 4; // 참여 완료 1건당 +4
  }
  // 특정 동의 현재 밝기 = 기본 + 그 동네에서 새로 켜진 등불만큼
  function dongBrightness(name) {
    const base = dongInfo(name).brightness;
    return Math.min(100, base + addedLanternsInDong(name) * 3);
  }
  function currentBrightness() {
    return dongBrightness(currentDong());
  }
  function brightnessStage(v) {
    const S = CFG.brightnessStages;
    let cur = S[0];
    for (const s of S) if (v >= s.min) cur = s;
    return cur;
  }
  // 밤 → 동트임 색상 보간
  function dawnColor(v) {
    const s = CFG.dawnScale;
    v = Math.max(0, Math.min(100, v));
    let a = s[0],
      b = s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) {
      if (v >= s[i].at && v <= s[i + 1].at) {
        a = s[i];
        b = s[i + 1];
        break;
      }
    }
    const t = b.at === a.at ? 0 : (v - a.at) / (b.at - a.at);
    const c = a.color.map((ca, i) => Math.round(ca + (b.color[i] - ca) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // ---------- 데이터 접근 ----------
  function getActivities() {
    return [...state.myActivities, ...(window.VOLUNTEER_DATA || [])];
  }
  function findActivity(id) {
    return getActivities().find((v) => v.id === id);
  }
  function getPosts() {
    const seed = (window.SARANGBANG_SEED || []).map((p) => ({ ...p, _seed: true }));
    const all = [...seed, ...state.userPosts];
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // ---------- 포인트 · 등급 ----------
  function heartPoints() {
    return state.certificates.reduce((s, c) => s + (c.points || 0), 0);
  }
  function levelInfo() {
    const pts = heartPoints();
    const L = CFG.levels;
    let cur = L[0];
    for (const lv of L) if (pts >= lv.min) cur = lv;
    const idx = L.indexOf(cur);
    const next = L[idx + 1] || null;
    const base = cur.min;
    const span = next ? next.min - base : 1;
    const progress = next ? Math.min(1, (pts - base) / span) : 1;
    return { cur, next, pts, progress, toNext: next ? next.min - pts : 0 };
  }
  function totalCertHours() {
    return state.certificates.reduce((s, c) => s + (c.hours || 0), 0);
  }

  // ---------- 유틸 ----------
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  function parseDate(str) {
    return new Date(str + "T00:00:00");
  }
  function daysLeft(dateStr) {
    return Math.ceil((parseDate(dateStr) - TODAY) / 86400000);
  }
  function ddayLabel(deadline) {
    const n = daysLeft(deadline);
    if (n < 0) return { text: "마감", urgent: true };
    if (n === 0) return { text: "오늘마감", urgent: true };
    return { text: "D-" + n, urgent: n <= 3 };
  }
  function fmtDate(dateStr) {
    const d = parseDate(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
  }
  function fmtWhen(iso) {
    const d = new Date(iso);
    const diff = Math.floor((TODAY - d) / 86400000);
    if (diff <= 0) return "오늘";
    if (diff === 1) return "어제";
    if (diff < 7) return diff + "일 전";
    return `${d.getMonth() + 1}.${d.getDate()}`;
  }
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  function nextSaturday(offsetWeeks) {
    const d = new Date(TODAY);
    let add = (6 - d.getDay() + 7) % 7;
    if (add === 0) add = 7;
    d.setDate(d.getDate() + add + (offsetWeeks || 0) * 7);
    return d;
  }
  function isClosed(item) {
    return daysLeft(item.deadline) < 0 || item.applied >= item.capacity;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }
  function shortRegion(r) {
    const parts = String(r).split(" ");
    return parts[parts.length - 1];
  }
  // 사용자 이름 (추후 가입 기능에서 확장)
  function myName() {
    return (state.profile && state.profile.name) || ME.name;
  }
  // 지역 문자열 → 동네(마지막 토큰). 예: "서울 마포구 연남동" → "연남동"
  function dongOfRegion(r) {
    return shortRegion(r);
  }
  function toast(msg) {
    els.toast.innerHTML = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (els.toast.hidden = true), 1900);
  }

  // ==========================================================
  //  온보딩 (밤 → 동트임)
  // ==========================================================
  const OB_SCENES = [6, 46, 84, 72, 92]; // 스텝별 하늘 밝기 (0~2 슬라이드, 3 동선택, 4 가입)
  function haversineKm(la1, lo1, la2, lo2) {
    const R = 6371,
      toR = (x) => (x * Math.PI) / 180;
    const dLa = toR(la2 - la1),
      dLo = toR(lo2 - lo1);
    const a =
      Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  const OB_SLIDES = [
    {
      emoji: "🌑",
      title: "지금, 우리 마을은<br/>깜깜해요",
      desc:
        "<b>반디</b>는 깊은 <b>밤</b>에서 시작해요.<br/>" +
        "이웃의 작은 봉사와 기부가 반디처럼 모이면,<br/>" +
        "<b>동이 트듯</b> 우리 마을이 서서히 밝아집니다.",
    },
    {
      emoji: "🌆",
      title: "마을마다<br/>색이 달라요",
      desc:
        "봉사와 기부가 쌓일수록<br/>" +
        "검정 → 보라 → 노을 → <b>황금빛</b>으로 물들어요.<br/>" +
        "어떤 마을은 아직 깜깜하고, 어떤 마을은 벌써 아침이에요.",
    },
    {
      emoji: "☀️",
      title: "우리 마을을 밝히는 건,<br/>바로 당신이에요",
      desc:
        "오늘 당신의 작은 한 걸음이<br/>" +
        "우리 마을을, 그리고 세상을 밝힙니다.<br/>" +
        "<b>오늘도, 당신이 마을의 해가 되어 주세요.</b>",
    },
  ];

  function buildOnboarding(startStep) {
    let ob = document.getElementById("onboarding");
    if (ob) ob.remove();
    ob = document.createElement("div");
    ob.id = "onboarding";
    ob.innerHTML = `
      <button class="ob-close" id="ob-close" aria-label="건너뛰기">✕</button>
      <div class="ob-sky" id="ob-sky">
        <div class="ob-stars" id="ob-stars"></div>
        <div class="ob-sun" id="ob-sun"></div>
        <div class="ob-hills"></div>
      </div>
      <div class="ob-panel">
        <div class="ob-content" id="ob-content"></div>
        <div class="ob-footer">
          <div class="ob-dots" id="ob-dots"></div>
          <div class="ob-actions">
            <button class="ob-back" id="ob-back">이전</button>
            <button class="ob-next" id="ob-next">다음</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ob);

    // 별
    const stars = ob.querySelector("#ob-stars");
    let dots = "";
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 100,
        y = Math.random() * 62,
        s = Math.random() * 2 + 1,
        delay = (Math.random() * 3).toFixed(1);
      dots += `<span class="ob-star" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:${delay}s"></span>`;
    }
    stars.innerHTML = dots;

    ob.querySelector("#ob-next").addEventListener("click", obNextClick);
    ob.querySelector("#ob-back").addEventListener("click", obBack);
    ob.querySelector("#ob-close").addEventListener("click", closeOnboarding);

    obGeoReq = false;
    obGeoState = "none";
    obGeo = null;
    obStep = startStep || 0;
    updateOnboarding();
  }
  function obNextClick() {
    if (obStep < 4) {
      obStep++;
      updateOnboarding();
    }
  }
  function obBack() {
    if (obStep > 0) {
      obStep--;
      updateOnboarding();
    }
  }
  function updateOnboarding() {
    const sky = document.getElementById("ob-sky");
    const sun = document.getElementById("ob-sun");
    const stars = document.getElementById("ob-stars");
    const content = document.getElementById("ob-content");
    const scene = OB_SCENES[obStep];

    // 하늘: 위(더 어두움) → 지평선(현재 밝기색)
    const top = dawnColor(Math.max(0, scene - 42));
    const horizon = dawnColor(scene);
    sky.style.background = `linear-gradient(180deg, ${top} 0%, ${dawnColor(
      Math.max(0, scene - 18)
    )} 48%, ${horizon} 100%)`;

    // 해: 밝을수록 위로 떠오르고 강하게 빛남
    sun.style.transform = `translate(-50%, ${(100 - scene) * 0.9}px)`;
    sun.style.opacity = Math.min(1, scene / 60).toFixed(2);
    const glow = Math.round(scene / 2);
    sun.style.boxShadow = `0 0 ${glow}px ${glow / 2}px rgba(255,196,110,0.8)`;
    sun.style.background = dawnColor(Math.min(100, scene + 12));

    // 별: 어두울 때만
    stars.style.opacity = Math.max(0, 1 - scene / 48).toFixed(2);

    // 내용
    if (obStep < 3) {
      const s = OB_SLIDES[obStep];
      content.innerHTML = `
        <div class="ob-emoji">${s.emoji}</div>
        <h2 class="ob-title">${s.title}</h2>
        <p class="ob-desc">${s.desc}</p>`;
    } else if (obStep === 3) {
      requestGeo();
      let dongs = CFG.dongs.slice();
      let sub;
      if (obGeoState === "ok" && obGeo) {
        dongs.forEach((d) => (d._dist = haversineKm(obGeo.lat, obGeo.lng, d.lat, d.lng)));
        dongs.sort((a, b) => a._dist - b._dist);
        sub = "📍 지금 내 위치에서 <b>가까운 순</b>이에요.";
      } else if (obGeoState === "denied") {
        sub = "위치 권한이 없어 <b>마포구</b> 기준으로 보여드려요.";
      } else {
        sub = "📡 내 위치를 확인하는 중… 가까운 동네를 찾고 있어요.";
      }
      content.innerHTML = `
        <h2 class="ob-title">우리 마을,<br/>어디예요?</h2>
        <p class="ob-desc">${sub}</p>
        <div class="ob-dong-grid">
          ${dongs
            .map((d) => {
              const col = dawnColor(d.brightness);
              const on = state.selectedDong === d.name ? " is-on" : "";
              const bline =
                obGeoState === "ok" && d._dist != null
                  ? `📍 ${d._dist < 1 ? Math.round(d._dist * 1000) + "m" : d._dist.toFixed(1) + "km"}`
                  : `🏮 ${d.lanterns}`;
              return `<button class="ob-dong${on}" data-dong="${d.name}">
                        <span class="ob-dong__swatch" style="background:${col}"></span>
                        <span class="ob-dong__name">${d.name}</span>
                        <span class="ob-dong__b">${bline}</span>
                      </button>`;
            })
            .join("")}
        </div>`;
      content.querySelectorAll(".ob-dong").forEach((b) =>
        b.addEventListener("click", () => selectDong(b.dataset.dong))
      );
    } else {
      // step 4 — 소셜 가입/로그인
      content.innerHTML = `
        <div class="ob-emoji">☀️</div>
        <h2 class="ob-title">반디,<br/>이렇게 시작해요</h2>
        <p class="ob-desc"><b>${escapeHtml(state.selectedDong || "연남동")}</b>의 반디로 활동하게 돼요 ✨</p>
        <div class="ob-social-wrap">
          <button class="ob-social ob-social--kakao" data-p="kakao"><span class="ob-social__ic">💬</span> 카카오로 시작하기</button>
          <button class="ob-social ob-social--google" data-p="google"><span class="ob-social__ic ob-social__g">G</span> Google로 시작하기</button>
          <button class="ob-social ob-social--apple" data-p="apple"><span class="ob-social__ic">🍎</span> Apple로 시작하기</button>
        </div>
        ${authEnabled() ? "" : `<p class="ob-desc" style="font-size:12px;opacity:.8;margin-top:16px">데모예요 — 실제 소셜 로그인은 Supabase 설정 후 동작해요.</p>`}`;
      content.querySelectorAll(".ob-social").forEach((b) =>
        b.addEventListener("click", () => socialSignup(b.dataset.p))
      );
    }

    // 푸터
    const dotsEl = document.getElementById("ob-dots");
    dotsEl.innerHTML = [0, 1, 2, 3, 4]
      .map((i) => `<span class="ob-dot ${i === obStep ? "is-on" : ""}"></span>`)
      .join("");
    const back = document.getElementById("ob-back");
    const next = document.getElementById("ob-next");
    back.style.visibility = obStep === 0 ? "hidden" : "visible";
    if (obStep === 3 || obStep === 4) {
      next.style.display = "none"; // 동네 선택/소셜 가입은 자체 버튼으로 진행
    } else {
      next.style.display = "";
      next.textContent = obStep === 2 ? "동네 고르러 가기 →" : "다음";
    }
  }
  function closeOnboarding() {
    // ✕ 건너뛰기 — 동네 미선택 시 기본값(연남동)으로 시작
    if (!state.selectedDong) state.selectedDong = "연남동";
    saveStore();
    const ob = document.getElementById("onboarding");
    if (ob) {
      ob.classList.add("is-leaving");
      setTimeout(() => ob.remove(), 420);
    }
    state.tab = "home";
    state.view = "list";
    syncTabbar();
    render();
  }
  function requestGeo() {
    if (obGeoReq) return;
    obGeoReq = true;
    if (!navigator.geolocation) {
      obGeoState = "denied";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        obGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        obGeoState = "ok";
        if (obStep === 3) updateOnboarding();
      },
      () => {
        obGeoState = "denied";
        if (obStep === 3) updateOnboarding();
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  }
  function selectDong(name) {
    state.selectedDong = name;
    saveStore();
    // 이미 로그인한 사용자가 동네만 바꾸는 경우 → 바로 닫기 (재로그인 X)
    if (state.profile && state.profile.signedUp) return finishOnboarding();
    obStep = 4; // 처음이면 소셜 가입 단계로
    updateOnboarding();
  }
  function socialSignup(provider) {
    if (!state.selectedDong) state.selectedDong = "연남동";
    saveStore(); // 리다이렉트 전에 동네 저장
    if (SB) {
      SB.auth.signInWithOAuth({
        provider: provider,
        options: { redirectTo: location.origin + location.pathname },
      });
      return; // 제공자 로그인 페이지로 이동 (돌아오면 checkAuthSession이 처리)
    }
    // 데모 폴백: 동네 기반 닉네임으로 가입 (로그인 유지, 로그아웃 없음)
    state.profile = { name: currentDong() + " 반디", signedUp: true, provider: provider };
    saveStore();
    finishOnboarding();
  }
  function finishOnboarding() {
    const ob = document.getElementById("onboarding");
    if (ob) {
      ob.classList.add("is-leaving");
      setTimeout(() => ob.remove(), 420);
    }
    state.tab = "home";
    state.view = "list";
    syncTabbar();
    render();
    toast(`${myName()}님, 환영해요! ${currentDong()}를 함께 밝혀요 ✨`);
  }

  // ==========================================================
  //  렌더 라우터
  // ==========================================================
  function render() {
    updateBadges();
    updateFab();
    updateHeader();

    if (state.view === "detail") return renderDetail();
    if (state.view === "certDetail") return renderCertDetail();
    if (state.view === "create") return renderCreate();
    if (state.view === "compose") return renderCompose();
    if (state.view === "manager") return renderManager();
    if (state.view === "donate") return renderDonate();
    if (state.view === "postDetail") return renderPostDetail();
    if (state.view === "ranking") return renderRanking();
    if (state.view === "receipt") return renderReceipt();

    if (state.tab === "home") return renderDashboard();
    if (state.tab === "find") return renderFind();
    if (state.tab === "sarangbang") return renderSarangbang();
    if (state.tab === "certs") return renderCerts();
    if (state.tab === "me") return renderMe();
  }
  function updateHeader() {
    const v = currentBrightness();
    const total = dongLanternTotal(currentDong());
    els.headerRegion.innerHTML =
      `<span class="hdr-dot" style="background:${dawnColor(v)}"></span>` +
      `${escapeHtml(currentDong())} <b>🏮${total}</b>`;
  }
  function updateBadges() {
    const n = [...state.applied].filter(findActivity).length;
    setBadge(els.mineBadge, n);
    setBadge(els.certsBadge, state.certificates.length);
  }
  function setBadge(el, n) {
    if (n > 0) {
      el.textContent = n;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
  function updateFab() {
    const show = state.view === "list" && (state.tab === "home" || state.tab === "find");
    els.fab.style.display = show ? "flex" : "none";
  }
  // ---------- 등불(내 선행) 집계 : 확인증 1개 = 등불 1개 ----------
  function lanternsTotal() {
    return state.certificates.length;
  }
  function lanternsByDong() {
    const m = {};
    state.certificates.forEach((c) => {
      const d = dongOfRegion(c.region);
      m[d] = (m[d] || 0) + 1;
    });
    return m;
  }
  function myLanternsInDong(dong) {
    return state.certificates.filter((c) => dongOfRegion(c.region) === dong).length;
  }
  function communityLanternsInDong(dong) {
    return state.communityLanterns[dong] || 0;
  }
  // 그 동네에 새로 켜진 등불 (나 + 이웃 출석확인분)
  function addedLanternsInDong(dong) {
    return myLanternsInDong(dong) + communityLanternsInDong(dong);
  }
  // 동네 전체 등불 = 이웃들 누적(시드) + 새로 켜진 등불
  function dongLanternTotal(dong) {
    return dongInfo(dong).lanterns + addedLanternsInDong(dong);
  }
  // 동네 이웃 기금 = 시드 + 내 기부
  function dongFund(dong) {
    return dongInfo(dong).donations + (state.donatedByDong[dong] || 0);
  }
  function fmtWon(n) {
    return "₩" + Number(n).toLocaleString("ko-KR");
  }
  // 이번 달 기금 목표(다음 50만원 단위) + 진행률
  function dongGoal(dong) {
    return Math.max(1000000, Math.ceil((dongFund(dong) + 1) / 500000) * 500000);
  }
  function myDonatedTotal() {
    return Object.values(state.donatedByDong).reduce((a, b) => a + b, 0);
  }
  // 업적 뱃지
  function badges() {
    const n = lanternsTotal();
    const dongCount = Object.keys(lanternsByDong()).length;
    return [
      { emoji: "🕯️", name: "첫 등불", desc: "첫 봉사 참여", got: n >= 1 },
      { emoji: "🏮", name: "등불 다섯", desc: "등불 5개", got: n >= 5 },
      { emoji: "🗼", name: "동네 등대", desc: "등불 10개", got: n >= 10 },
      { emoji: "🗺️", name: "발 넓은 반디", desc: "2개 동네+", got: dongCount >= 2 },
      { emoji: "💛", name: "기부 천사", desc: "첫 기부", got: myDonatedTotal() >= 1 },
      { emoji: "📣", name: "봉사 주최", desc: "봉사 올리기", got: state.myActivities.length >= 1 },
      { emoji: "🙌", name: "제안왕", desc: "사랑방 제안", got: state.userPosts.length >= 1 },
    ];
  }
  // 내 반디 자랑하기 (공유)
  function shareBrag() {
    const n = lanternsTotal();
    const dong = currentDong();
    const text =
      n > 0
        ? `나, 반디에서 등불 ${n}개를 켰어요! 🏮 우리 ${dong}를 밝히는 중이에요 ✨ #반디 #봉사`
        : `반디에서 우리 ${dong}를 밝혀볼래요? 🏮 작은 봉사가 큰 빛이 돼요 ✨ #반디`;
    const url = location.origin + location.pathname;
    if (navigator.share) {
      navigator.share({ title: "반디", text: text, url: url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + " " + url).then(
        () => toast("자랑 문구를 복사했어요! 어디든 붙여넣어 자랑해보세요 🔗"),
        () => toast("복사에 실패했어요.")
      );
    } else {
      toast("이 브라우저는 공유를 지원하지 않아요.");
    }
  }
  // 찜(관심 봉사)
  function isSaved(id) {
    return state.saved.has(id);
  }
  function toggleSave(id) {
    if (state.saved.has(id)) state.saved.delete(id);
    else state.saved.add(id);
    saveStore();
  }
  // 사랑방 댓글
  function commentCount(id) {
    return (state.postComments[id] || []).length;
  }
  function findPost(id) {
    return getPosts().find((p) => p.id === id);
  }
  // 봉사 후기
  let reviewPhoto = null; // 작성 중 임시 사진(dataURL)
  function readPhoto(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        let w = img.width,
          h = img.height;
        if (w > max || h > max) {
          const s = max / Math.max(w, h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL("image/jpeg", 0.7));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  // 동네 랭킹 (등불 많은 순)
  function ranking() {
    return CFG.dongs
      .map((d) => ({ name: d.name, lanterns: dongLanternTotal(d.name), fund: dongFund(d.name) }))
      .sort((a, b) => b.lanterns - a.lanterns);
  }
  // 봉사한 사람에게 건네는 따뜻한 칭찬 한마디
  function affirmation() {
    const n = lanternsTotal();
    const dong = currentDong();
    if (n === 0)
      return "아직 첫 등불 전이에요. 작은 봉사 하나가 큰 빛이 됩니다.<br/>오늘, 당신의 첫 등불을 켜볼까요? 🌱";
    if (n < 3)
      return `벌써 등불 <b>${n}개</b>를 켰어요.<br/>당신 덕분에 ${escapeHtml(dong)}이(가) 조금씩 밝아지고 있어요 🕯️`;
    if (n < 7)
      return `등불 <b>${n}개</b>! 당신은 이미 ${escapeHtml(dong)}의 소중한 이웃이에요.<br/>참 고마운 사람이에요 💛`;
    if (n < 15)
      return `등불 <b>${n}개</b>를 켠 당신, 정말 멋져요.<br/>${escapeHtml(dong)}을(를) 환하게 밝히고 있어요 ✨`;
    return `등불 <b>${n}개</b>… 당신은 ${escapeHtml(dong)}의 등대 같은 사람이에요.<br/>세상을 밝히는 대단한 이웃이에요 🗼`;
  }

  // ---------- 찾기(홈) ----------
  function brightnessWidget() {
    const dong = currentDong();
    const v = currentBrightness();
    const st = brightnessStage(v);
    const myLant = myLanternsInDong(dong);
    const top = dawnColor(Math.max(0, v - 34));
    const horizon = dawnColor(v);
    const sunGlow = Math.min(1, v / 55).toFixed(2);
    return `
      <div class="bright" style="background:linear-gradient(160deg, ${top}, ${horizon})">
        <div class="bright__sun" style="opacity:${sunGlow}"></div>
        <div class="bright__head">
          <div class="bright__stage">${st.emoji} ${st.name}</div>
          <div class="bright__val">${v}<span>밝기</span></div>
        </div>
        <div class="bright__bar"><i style="width:${v}%"></i></div>
        <div class="bright__foot">
          <b>${escapeHtml(dong)}</b>을(를) 이웃들과 함께 밝히고 있어요
          ${myLant > 0 ? `· 내가 켠 등불 <b>🏮 ${myLant}개</b>` : "· 첫 봉사로 우리 마을에 등불을 켜보세요"}
        </div>
      </div>`;
  }

  function cardHtml(item) {
    const dd = ddayLabel(item.deadline);
    const pct = Math.min(100, Math.round((item.applied / item.capacity) * 100));
    const mine = item.id.indexOf("my") === 0;
    let tag = "";
    if (state.attended.has(item.id)) tag = '<span class="pill pill--done">참여완료</span>';
    else if (state.applied.has(item.id)) tag = '<span class="pill pill--applied">신청함</span>';
    else if (mine) tag = '<span class="pill pill--mine">내가올림</span>';
    return `
      <article class="card" data-id="${item.id}">
        <div class="card__top">
          <span class="card__cat">${escapeHtml(item.category)}</span>
          <span class="card__dday ${dd.urgent ? "is-urgent" : ""}">${dd.text}</span>
        </div>
        <h3 class="card__title">${escapeHtml(item.title)}</h3>
        <div class="card__meta">
          🏢 <b>${escapeHtml(item.org)}</b><br/>
          📍 ${escapeHtml(item.region)}<br/>
          🗓️ ${fmtDate(item.date)} · ${escapeHtml(item.time)}
        </div>
        <div class="card__foot">
          <div class="recruit-bar"><i style="width:${pct}%"></i></div>
          <span class="recruit-text">${item.applied}/${item.capacity}명</span>
          ${tag ? `<span style="margin-left:8px">${tag}</span>` : ""}
          <button class="save-btn ${isSaved(item.id) ? "is-on" : ""}" data-save="${item.id}" aria-label="찜">${isSaved(item.id) ? "♥" : "♡"}</button>
        </div>
      </article>`;
  }

  // ---------- 홈 대시보드 ----------
  function renderDashboard() {
    const lv = levelInfo();
    const dong = currentDong();
    const myLant = lanternsTotal();
    const recs = getActivities()
      .filter((a) => !state.attended.has(a.id) && !isClosed(a))
      .sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline))
      .slice(0, 3);
    const h = new Date().getHours();
    const greet = h < 6 ? "고요한 밤이에요" : h < 11 ? "좋은 아침이에요" : h < 18 ? "좋은 오후예요" : "포근한 저녁이에요";
    els.view.innerHTML = `
      <div class="dash-greet">${greet}, <b>${escapeHtml(myName())}</b> ✨<br/>
        <span>오늘도 우리 ${escapeHtml(dong)}에 등불을 켜볼까요?</span></div>
      ${brightnessWidget()}
      <div class="dash-stats">
        <div class="dash-stat"><div class="dash-stat__num">🏮 ${myLant}</div><div class="dash-stat__lbl">내가 켠 등불</div></div>
        <div class="dash-stat"><div class="dash-stat__num">${lv.cur.emoji}</div><div class="dash-stat__lbl">${lv.cur.name}</div></div>
        <div class="dash-stat"><div class="dash-stat__num">${state.certificates.length}</div><div class="dash-stat__lbl">마음확인증</div></div>
      </div>
      <div class="dash-actions">
        <button class="dash-act" data-go="find"><span class="dash-act__ic">🔍</span>봉사 찾기</button>
        <button class="dash-act" data-go="create"><span class="dash-act__ic">➕</span>봉사 올리기</button>
        <button class="dash-act" data-go="sarangbang"><span class="dash-act__ic">💬</span>사랑방</button>
      </div>

      <div class="fund">
        <div class="fund__head">🤝 우리 <b>${escapeHtml(dong)}</b> 이웃 기금</div>
        <div class="fund__amt">${fmtWon(dongFund(dong))}</div>
        <div class="fund-goal">
          <div class="fund-goal__bar"><i style="width:${Math.min(100, Math.round((dongFund(dong) / dongGoal(dong)) * 100))}%"></i></div>
          <div class="fund-goal__txt">🎯 이번 달 목표 ${fmtWon(dongGoal(dong))} · <b>${Math.round((dongFund(dong) / dongGoal(dong)) * 100)}%</b></div>
        </div>
        <div class="fund__sub">🏮 봉사 등불 ${dongLanternTotal(dong)} · 이웃들이 함께 모았어요</div>
        <button class="btn btn--primary" id="btn-donate">우리 동네 기부하기</button>
      </div>
      <div class="fund-uses">
        <div class="fund-uses__title">💡 모인 기금은 이렇게 써요</div>
        <div class="fund-uses__desc">앱에 모인 이웃들이 <b>주기적으로 이 기금으로 동네 봉사</b>를 해요.</div>
        ${CFG.fundUses
          .map(
            (u) => `
          <div class="fund-use">
            <span class="fund-use__ic">${u.emoji}</span>
            <div class="fund-use__body">
              <div class="fund-use__title">${escapeHtml(u.title)}</div>
              <div class="fund-use__cycle">${escapeHtml(u.cycle)}</div>
            </div>
            <span class="fund-use__cost">${fmtWon(u.cost)}/회</span>
          </div>`
          )
          .join("")}
      </div>

      <div class="dash-sec">
        <span>🏆 이번 주 밝은 동네</span>
        <button class="dash-more" data-rank="1">전체 보기 →</button>
      </div>
      ${ranking()
        .slice(0, 3)
        .map(
          (r, i) => `
        <div class="rank-row ${r.name === dong ? "is-me" : ""}">
          <span class="rank-row__medal">${["🥇", "🥈", "🥉"][i]}</span>
          <span class="rank-row__name">${escapeHtml(r.name)}${r.name === dong ? " · 우리 동네" : ""}</span>
          <span class="rank-row__val">🏮 ${r.lanterns}</span>
        </div>`
        )
        .join("")}

      <div class="dash-sec">
        <span>🔥 지금 마감 임박</span>
        <button class="dash-more" data-go="find">전체 보기 →</button>
      </div>
      ${
        recs.length
          ? recs.map(cardHtml).join("")
          : `<div class="empty" style="padding:30px 20px"><div class="empty__icon">🌙</div><div class="empty__title">지금은 임박한 봉사가 없어요</div><div>찾기에서 천천히 둘러보세요.</div></div>`
      }
    `;
    els.view.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => {
        const g = b.dataset.go;
        if (g === "create") return openCreate();
        state.tab = g;
        state.view = "list";
        syncTabbar();
        render();
      })
    );
    on("btn-donate", openDonate);
    els.view.querySelectorAll("[data-rank]").forEach((b) => b.addEventListener("click", openRanking));
    bindCards();
    els.view.scrollTop = 0;
  }

  // ---------- 동네 랭킹 ----------
  function openRanking() {
    state.view = "ranking";
    render();
  }
  function renderRanking() {
    const dong = currentDong();
    const list = ranking();
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 홈으로</button>
      <div class="section-head">🏆 우리 마포구 동네 랭킹</div>
      <div class="sb-intro">봉사 등불이 많이 켜진 동네 순이에요. 오늘도 우리 동네를 밝혀봐요!</div>
      <div class="rank-list">
        ${list
          .map(
            (r, i) => `
          <div class="rank-row rank-row--full ${r.name === dong ? "is-me" : ""}">
            <span class="rank-row__no">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
            <span class="rank-row__name">${escapeHtml(r.name)}${r.name === dong ? " · 우리 동네" : ""}</span>
            <span class="rank-row__stats">🏮 ${r.lanterns} · ${fmtWon(r.fund)}</span>
          </div>`
          )
          .join("")}
      </div>`;
    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "list";
      state.tab = "home";
      syncTabbar();
      render();
    });
    els.view.scrollTop = 0;
  }

  // ---------- 우리 동네 기부(이웃 기금) — 데모 ----------
  let donateAmount = 5000;
  function openDonate() {
    donateAmount = (CFG.donationPresets && CFG.donationPresets[1]) || 5000;
    state.view = "donate";
    render();
  }
  function renderDonate() {
    const dong = currentDong();
    const presets = CFG.donationPresets || [1000, 5000, 10000, 30000];
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 뒤로</button>
      <div class="section-head">🤝 우리 ${escapeHtml(dong)} 이웃 기금</div>
      <div class="fund fund--lg">
        <div class="fund__head">지금까지 모인 기금</div>
        <div class="fund__amt">${fmtWon(dongFund(dong))}</div>
        <div class="fund__sub">이 기금으로 이웃들이 동네 봉사를 이어가요</div>
      </div>
      <div class="field"><label>얼마를 보탤까요?</label>
        <div class="pick" id="pick-amt">
          ${presets
            .map(
              (a) => `<button class="pick__btn ${a === donateAmount ? "is-on" : ""}" data-v="${a}">${fmtWon(a)}</button>`
            )
            .join("")}
        </div>
      </div>
      <p class="form-hint">💛 작은 금액도 이웃에게 큰 등불이 돼요.</p>
      <label class="chk"><input type="checkbox" id="chk-recurring" ${state.recurring ? "checked" : ""}/> <span>매월 이 금액으로 <b>정기 기부</b>하기</span></label>
      <div class="notice">※ <b>데모 화면</b>이에요. 실제 결제·이체는 이루어지지 않아요. (실서비스에선 안전한 결제·모금 절차가 필요해요)</div>
      <div class="action-dock">
        <button class="btn btn--primary" id="btn-give">${fmtWon(donateAmount)} 기부하기 (데모)</button>
      </div>
    `;
    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "list";
      state.tab = "home";
      syncTabbar();
      render();
    });
    els.view.querySelectorAll("#pick-amt .pick__btn").forEach((b) =>
      b.addEventListener("click", () => {
        donateAmount = Number(b.dataset.v);
        document.getElementById("btn-give").textContent = fmtWon(donateAmount) + " 기부하기 (데모)";
        els.view.querySelectorAll("#pick-amt .pick__btn").forEach((x) => x.classList.toggle("is-on", x === b));
      })
    );
    on("btn-give", doDonate);
    els.view.scrollTop = 0;
  }
  function doDonate() {
    const dong = currentDong();
    state.donatedByDong[dong] = (state.donatedByDong[dong] || 0) + donateAmount;
    const seq = String(state.donationReceipts.length + 1).padStart(4, "0");
    state.donationReceipts.unshift({
      id: "RC-2026-" + seq,
      dong: dong,
      amount: donateAmount,
      at: new Date().toISOString(),
    });
    const rec = document.getElementById("chk-recurring");
    if (rec && rec.checked) state.recurring = { amount: donateAmount, dong: dong };
    else if (rec && !rec.checked && state.recurring) state.recurring = null;
    saveStore();
    state.view = "list";
    state.tab = "home";
    syncTabbar();
    toast(`${fmtWon(donateAmount)} 기부 완료! 영수증이 발급됐어요 🧾💛`);
    render();
  }
  function openReceipt(id) {
    state.receiptId = id;
    state.view = "receipt";
    render();
  }
  function renderReceipt() {
    const r = state.donationReceipts.find((x) => x.id === state.receiptId);
    if (!r) {
      state.view = "list";
      state.tab = "me";
      syncTabbar();
      return render();
    }
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 뒤로</button>
      <div class="receipt">
        <div class="receipt__seal">🧾</div>
        <div class="receipt__brand">반디 이웃 기금</div>
        <div class="receipt__label">기부 영수증</div>
        <div class="receipt__no">${escapeHtml(r.id)}</div>
        <div class="receipt__amt">${fmtWon(r.amount)}</div>
        <div class="certificate__rows">
          <div><span>기부처</span><b>${escapeHtml(r.dong)} 이웃 기금</b></div>
          <div><span>기부자</span><b>${escapeHtml(myName())}</b></div>
          <div><span>기부일</span><b>${fmtDate(r.at.slice(0, 10))}</b></div>
        </div>
        <div class="certificate__sign">💛 ${escapeHtml(r.dong)}를 밝혀주셔서 고마워요</div>
      </div>
      <div class="notice notice--sm">※ <b>데모 영수증</b>이에요. 실제 결제·세금 공제용 영수증이 아니에요.</div>
    `;
    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "list";
      state.tab = "me";
      syncTabbar();
      render();
    });
    els.view.scrollTop = 0;
  }

  // ---------- 찾기 ----------
  function renderFind() {
    const data = getActivities();
    const kw = state.keyword.trim().toLowerCase();
    let list = data.filter((item) => {
      const catOk = state.category === "전체" || item.category === state.category;
      const kwOk =
        !kw ||
        item.title.toLowerCase().includes(kw) ||
        item.org.toLowerCase().includes(kw) ||
        item.region.toLowerCase().includes(kw);
      return catOk && kwOk;
    });
    list.sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline));

    const chips = CATS.map(
      (c) =>
        `<button class="chip ${c === state.category ? "is-active" : ""}" data-cat="${c}">${c}</button>`
    ).join("");

    const cards = list.length
      ? list.map(cardHtml).join("")
      : `<div class="empty">
           <div class="empty__icon">🔍</div>
           <div class="empty__title">조건에 맞는 봉사활동이 없어요</div>
           <div>검색어나 카테고리를 바꿔보세요.</div>
         </div>`;

    els.view.innerHTML = `
      <div class="section-head">🔍 우리 동네 봉사 찾기</div>
      <div class="searchbar">
        <span class="s-icon">🔍</span>
        <input id="search-input" type="search" placeholder="제목, 기관, 지역 검색"
               value="${escapeHtml(state.keyword)}" />
      </div>
      <div class="chips">${chips}</div>
      <div class="result-count">${list.length}개의 봉사활동</div>
      ${cards}
    `;

    const input = document.getElementById("search-input");
    input.addEventListener("input", (e) => {
      state.keyword = e.target.value;
      clearTimeout(renderFind._t);
      renderFind._t = setTimeout(() => {
        renderFind();
        const i = document.getElementById("search-input");
        if (i) {
          i.focus();
          i.setSelectionRange(i.value.length, i.value.length);
        }
      }, 200);
    });
    els.view.querySelectorAll(".chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        state.category = chip.dataset.cat;
        renderFind();
      })
    );
    bindCards();
    els.view.scrollTop = 0;
  }

  function bindCards() {
    els.view.querySelectorAll(".card").forEach((card) =>
      card.addEventListener("click", () => openDetail(card.dataset.id))
    );
    els.view.querySelectorAll(".save-btn").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSave(b.dataset.save);
        render();
      })
    );
  }

  // ---------- 활동 상세 ----------
  function renderDetail() {
    const item = findActivity(state.detailId);
    if (!item) return goList();
    const applied = state.applied.has(item.id);
    const attended = state.attended.has(item.id);
    const closed = isClosed(item);
    const dd = ddayLabel(item.deadline);
    const spotsLeft = Math.max(0, item.capacity - item.applied);
    const cert = state.certificates.find((c) => c.activityId === item.id);

    const mine = item.id.indexOf("my") === 0; // 내가 올린(주최) 봉사
    let dock;
    if (mine) {
      dock = `<button class="btn btn--primary" id="btn-manage">🛠️ 참여자 출석 관리</button>`;
    } else if (attended) {
      dock = `<button class="btn btn--ghost" id="btn-viewcert">🕯️ 마음확인증 보기</button>`;
    } else if (applied) {
      dock = `
        <div class="dock-row">
          <button class="btn btn--danger" id="btn-cancel">신청 취소</button>
          <button class="btn btn--primary" id="btn-manage">🔑 주최자 출석확인</button>
        </div>`;
    } else if (closed) {
      dock = `<button class="btn btn--disabled" disabled>모집 마감</button>`;
    } else {
      dock = `<button class="btn btn--primary" id="btn-apply">신청하기 (${spotsLeft}자리 남음)</button>`;
    }

    let reviewHtml = "";
    if (attended) {
      const rv = state.reviews[item.id];
      reviewHtml = rv
        ? `<h3 class="detail__sec-title">✍️ 내 후기</h3>
           <div class="review">
             ${rv.photo ? `<img class="review__photo" src="${rv.photo}" alt="후기 사진"/>` : ""}
             ${rv.text ? `<div class="review__text">${escapeHtml(rv.text)}</div>` : ""}
             <div class="review__at">${fmtWhen(rv.at)}</div>
           </div>`
        : `<h3 class="detail__sec-title">✍️ 후기 남기기</h3>
           <div class="review-form">
             <textarea id="rv-text" rows="3" placeholder="봉사 어떠셨어요? 한 줄 후기를 남겨보세요"></textarea>
             <label class="rv-photo-btn">📷 사진 추가<input id="rv-photo" type="file" accept="image/*" hidden/></label>
             <img id="rv-preview" class="review__photo" style="display:none"/>
             <button class="btn btn--primary" id="rv-save">후기 저장</button>
           </div>`;
    }

    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 목록으로</button>
      <div class="detail__hero">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="card__cat">${escapeHtml(item.category)}</span>
          <span class="card__dday ${dd.urgent ? "is-urgent" : ""}">${dd.text}</span>
        </div>
        <h2 class="detail__title">${escapeHtml(item.title)}</h2>
        <div class="detail__row"><span class="k">주최기관</span><span class="v">${escapeHtml(item.org)}</span></div>
        <div class="detail__row"><span class="k">활동지역</span><span class="v">${escapeHtml(item.region)}</span></div>
        <div class="detail__row"><span class="k">활동일시</span><span class="v">${fmtDate(item.date)} · ${escapeHtml(item.time)}</span></div>
        <div class="detail__row"><span class="k">봉사시간</span><span class="v">${item.hours}시간 · 마음포인트 ${item.points}p</span></div>
        <div class="detail__row"><span class="k">모집인원</span><span class="v">${item.applied} / ${item.capacity}명 (${spotsLeft}자리 남음)</span></div>
        <div class="detail__row"><span class="k">신청마감</span><span class="v">${fmtDate(item.deadline)}</span></div>
      </div>
      ${attended && cert ? `<div class="notice notice--done">🎉 참여를 마쳤어요! <b>${escapeHtml(cert.certId)}</b> 마음확인증이 발급됐어요.</div>` : ""}
      ${applied && !mine && !attended ? `<div class="notice">🕒 봉사가 끝나면 <b>주최자가 출석을 확인</b>해요. 확인되면 등불이 켜지고 마음확인증이 발급돼요.</div>` : ""}
      ${mine ? `<div class="notice">🛠️ 내가 올린 봉사예요. 봉사 종료 후 <b>참여자 출석을 확인</b>해 주세요.</div>` : ""}
      <h3 class="detail__sec-title">활동 안내</h3>
      <div class="detail__desc">${escapeHtml(item.desc)}</div>
      ${reviewHtml}
      <div class="action-dock">${dock}</div>
    `;

    document.getElementById("btn-back").addEventListener("click", goList);
    on("btn-apply", () => doApply(item));
    on("btn-cancel", () => doCancel(item));
    on("btn-manage", () => openManager(item.id));
    on("btn-viewcert", () => cert && openCert(cert.certId));
    on("rv-save", () => saveReview(item.id));
    const pf = document.getElementById("rv-photo");
    if (pf)
      pf.addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (f)
          readPhoto(f, (url) => {
            reviewPhoto = url;
            const pv = document.getElementById("rv-preview");
            if (pv) {
              pv.src = url;
              pv.style.display = "block";
            }
          });
      });
    els.view.scrollTop = 0;
  }

  // ---------- 확인증함 ----------
  function renderCerts() {
    const certs = [...state.certificates].sort(
      (a, b) => new Date(b.issuedAt) - new Date(a.issuedAt)
    );
    const head = `<div class="section-head">🏮 내 등불함</div>`;

    if (!certs.length) {
      els.view.innerHTML =
        head +
        `<div class="notice">${DISCLAIMER}</div>` +
        `<div class="empty">
          <div class="empty__icon">🏮</div>
          <div class="empty__title">아직 켠 등불이 없어요</div>
          <div>봉사에 참여하고 주최자가 출석을 확인하면<br/>등불이 켜지고 마음확인증이 발급돼요.</div>
        </div>`;
      return;
    }

    const total = lanternsTotal();
    const entries = Object.entries(lanternsByDong()).sort((a, b) => b[1] - a[1]);
    const maxN = entries[0][1];
    const dongRows = entries
      .map(([d, n]) => {
        const v = dongBrightness(d);
        const pct = Math.max(8, Math.round((n / maxN) * 100));
        return `<div class="lant-row">
          <span class="lant-row__dot" style="background:${dawnColor(v)}"></span>
          <span class="lant-row__name">${escapeHtml(d)}</span>
          <span class="lant-row__bar"><i style="width:${pct}%; background:${dawnColor(Math.max(40, v))}"></i></span>
          <span class="lant-row__n">🏮 ${n}</span>
        </div>`;
      })
      .join("");

    const cards = certs
      .map(
        (c) => `
        <article class="cert-card" data-cert="${c.certId}">
          <div class="cert-card__ribbon">마음확인증</div>
          <div class="cert-card__no">${escapeHtml(c.certId)}</div>
          <h3 class="cert-card__title">${escapeHtml(c.title)}</h3>
          <div class="cert-card__meta">${escapeHtml(c.org)} · ${escapeHtml(c.region)}</div>
          <div class="cert-card__foot">
            <span>🗓️ ${fmtDate(c.date)}</span>
            <span>🏮 등불 1 · ${c.hours}시간</span>
          </div>
        </article>`
      )
      .join("");

    els.view.innerHTML =
      head +
      `<div class="lant-hero">
         <div class="lant-hero__big">🏮 <b>${total}</b></div>
         <div class="lant-hero__lbl">지금까지 내가 켠 등불</div>
       </div>
       <div class="lant-dongs">
         <div class="lant-dongs__title">동네별로 밝힌 등불</div>
         ${dongRows}
       </div>
       <div class="section-head" style="font-size:16px; margin-top:22px">🕯️ 마음확인증</div>
       <div class="notice">${DISCLAIMER}</div>` +
      cards;

    els.view.querySelectorAll(".cert-card").forEach((el) =>
      el.addEventListener("click", () => openCert(el.dataset.cert))
    );
    els.view.scrollTop = 0;
  }

  function renderCertDetail() {
    const c = state.certificates.find((x) => x.certId === state.certId);
    if (!c) return backToCerts();
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 확인증함으로</button>
      <div class="certificate">
        <div class="certificate__seal">🕯️</div>
        <div class="certificate__brand">반디</div>
        <div class="certificate__label">마음확인증</div>
        <div class="certificate__no">${escapeHtml(c.certId)}</div>
        <h2 class="certificate__title">${escapeHtml(c.title)}</h2>
        <p class="certificate__body">
          <b>${escapeHtml(c.participant)}</b> 님은<br/>
          <b>${escapeHtml(c.org)}</b>의 위 활동에 마음을 나눠<br/>
          우리 동네를 함께 밝혀 주셨습니다.
        </p>
        <div class="certificate__rows">
          <div><span>활동지역</span><b>${escapeHtml(c.region)}</b></div>
          <div><span>활동일</span><b>${fmtDate(c.date)}</b></div>
          <div><span>함께한 시간</span><b>${c.hours}시간</b></div>
          <div><span>마음포인트</span><b>${c.points}p</b></div>
          <div><span>발급일</span><b>${fmtDate(c.issuedAt.slice(0, 10))}</b></div>
        </div>
        <div class="certificate__sign">✨ 반디 이웃들 드림</div>
      </div>
      <div class="notice notice--sm">${DISCLAIMER}</div>
    `;
    document.getElementById("btn-back").addEventListener("click", backToCerts);
    els.view.scrollTop = 0;
  }

  // ---------- 사랑방 ----------
  function postView(p) {
    const isProposal = p.type === "proposal";
    const joined = isJoined(p);
    const count = joinCount(p);
    return `
      <article class="post" data-post="${p.id}">
        <div class="post__head">
          <span class="post__type ${isProposal ? "is-proposal" : ""}">${isProposal ? "🙌 제안" : "💬 자유"}</span>
          <span class="post__when">${fmtWhen(p.createdAt)}</span>
        </div>
        ${isProposal && p.title ? `<h3 class="post__title">${escapeHtml(p.title)}</h3>` : ""}
        <div class="post__body">${escapeHtml(p.body)}</div>
        <div class="post__foot">
          <span class="post__author">${escapeHtml(p.author)} · ${escapeHtml(shortRegion(p.region))}</span>
          <span class="post__right">
            <span class="post__cmt">💬 ${commentCount(p.id)}</span>
            ${
              isProposal
                ? `<button class="join-btn ${joined ? "is-joined" : ""}" data-post="${p.id}">${joined ? "함께해요 ✓" : "같이할래요"} <b>${count}</b></button>`
                : ""
            }
          </span>
        </div>
      </article>`;
  }

  function renderSarangbang() {
    const filters = ["전체", "제안", "자유"];
    let list = getPosts();
    if (state.sbFilter === "제안") list = list.filter((p) => p.type === "proposal");
    if (state.sbFilter === "자유") list = list.filter((p) => p.type === "free");

    const chips = filters
      .map(
        (f) =>
          `<button class="chip ${f === state.sbFilter ? "is-active" : ""}" data-sb="${f}">${f}</button>`
      )
      .join("");

    els.view.innerHTML = `
      <div class="section-head">💬 사랑방</div>
      <div class="sb-intro">우리 동네에서 <b>“이거 같이 해볼래요?”</b> — 작은 제안이 봉사가 돼요.</div>
      <button class="btn btn--primary btn--compose" id="btn-compose">✏️ 이웃에게 제안하기</button>
      <div class="chips" style="margin-top:14px">${chips}</div>
      ${
        list.length
          ? list.map(postView).join("")
          : `<div class="empty"><div class="empty__icon">💬</div><div class="empty__title">아직 글이 없어요</div><div>첫 제안을 남겨보세요.</div></div>`
      }
    `;

    on("btn-compose", openCompose);
    els.view.querySelectorAll(".chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        state.sbFilter = chip.dataset.sb;
        renderSarangbang();
      })
    );
    els.view.querySelectorAll(".post").forEach((el) =>
      el.addEventListener("click", () => openPost(el.dataset.post))
    );
    els.view.querySelectorAll(".join-btn").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleJoin(b.dataset.post);
        renderSarangbang();
      })
    );
    els.view.scrollTop = 0;
  }

  // ---------- 사랑방 글 상세 + 댓글 ----------
  function openPost(id) {
    state.postId = id;
    state.view = "postDetail";
    render();
  }
  function renderPostDetail() {
    const p = findPost(state.postId);
    if (!p) {
      state.view = "list";
      state.tab = "sarangbang";
      syncTabbar();
      return render();
    }
    const isProposal = p.type === "proposal";
    const joined = isJoined(p);
    const jc = joinCount(p);
    const comments = state.postComments[p.id] || [];
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 사랑방으로</button>
      <article class="post post--full">
        <div class="post__head">
          <span class="post__type ${isProposal ? "is-proposal" : ""}">${isProposal ? "🙌 제안" : "💬 자유"}</span>
          <span class="post__when">${fmtWhen(p.createdAt)}</span>
        </div>
        ${isProposal && p.title ? `<h2 class="post__title">${escapeHtml(p.title)}</h2>` : ""}
        <div class="post__body">${escapeHtml(p.body)}</div>
        <div class="post__foot">
          <span class="post__author">${escapeHtml(p.author)} · ${escapeHtml(shortRegion(p.region))}</span>
          ${
            isProposal
              ? `<button class="join-btn ${joined ? "is-joined" : ""}" id="p-join">${joined ? "함께해요 ✓" : "같이할래요"} <b>${jc}</b></button>`
              : ""
          }
        </div>
      </article>
      <div class="section-head" style="font-size:15px;margin-top:18px">💬 댓글 ${comments.length}</div>
      <div class="comments">
        ${
          comments.length
            ? comments
                .map(
                  (c) => `
              <div class="comment">
                <div class="comment__author">${escapeHtml(c.author)} <span>· ${fmtWhen(c.at)}</span></div>
                <div class="comment__body">${escapeHtml(c.body)}</div>
              </div>`
                )
                .join("")
            : `<div class="mini-note">첫 댓글을 남겨보세요 💛</div>`
        }
      </div>
      <div class="action-dock">
        <div class="cmt-input">
          <input id="cmt-text" type="text" maxlength="120" placeholder="따뜻한 댓글을 남겨주세요" />
          <button class="btn btn--primary" id="cmt-send">등록</button>
        </div>
      </div>
    `;
    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "list";
      state.tab = "sarangbang";
      syncTabbar();
      render();
    });
    on("p-join", () => {
      toggleJoin(p.id);
      renderPostDetail();
    });
    on("cmt-send", () => addComment(p.id));
    const ci = document.getElementById("cmt-text");
    if (ci) ci.addEventListener("keydown", (e) => { if (e.key === "Enter") addComment(p.id); });
    els.view.scrollTop = 0;
  }
  function addComment(id) {
    const el = document.getElementById("cmt-text");
    const t = (el ? el.value : "").trim();
    if (!t) return toast("댓글을 입력해주세요.");
    (state.postComments[id] = state.postComments[id] || []).push({
      author: myName(),
      body: t,
      at: new Date().toISOString(),
    });
    saveStore();
    renderPostDetail();
    toast("댓글을 남겼어요 💬");
  }

  function isJoined(p) {
    if (p._seed) return state.joinedSeed.has(p.id);
    return (p.joinedBy || []).includes(myName());
  }
  function joinCount(p) {
    if (p._seed) return (p.wantCount || 0) + (state.joinedSeed.has(p.id) ? 1 : 0);
    return (p.joinedBy || []).length;
  }
  function toggleJoin(id) {
    const seed = (window.SARANGBANG_SEED || []).find((p) => p.id === id);
    if (seed) {
      if (state.joinedSeed.has(id)) {
        state.joinedSeed.delete(id);
        toast("함께하기를 취소했어요.");
      } else {
        state.joinedSeed.add(id);
        toast("좋아요! 이웃에게 알려드릴게요 🙌");
      }
    } else {
      const up = state.userPosts.find((p) => p.id === id);
      if (!up) return;
      up.joinedBy = up.joinedBy || [];
      const i = up.joinedBy.indexOf(myName());
      if (i >= 0) up.joinedBy.splice(i, 1);
      else up.joinedBy.push(myName());
    }
    saveStore();
  }

  // ---------- 사랑방 글쓰기 ----------
  function openCompose() {
    composeForm = { type: "proposal", title: "", body: "" };
    state.view = "compose";
    render();
  }
  function renderCompose() {
    const f = composeForm;
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 사랑방으로</button>
      <div class="section-head">이웃에게 남기기</div>
      <div class="seg" id="seg-type">
        <button class="seg__btn ${f.type === "proposal" ? "is-on" : ""}" data-t="proposal">🙌 활동 제안</button>
        <button class="seg__btn ${f.type === "free" ? "is-on" : ""}" data-t="free">💬 자유글</button>
      </div>
      ${
        f.type === "proposal"
          ? `<div class="field">
               <label>무엇을 같이 해볼까요? <i>(제목)</i></label>
               <input id="c-title" type="text" maxlength="40" placeholder="예: 주말에 골목 꽃 심기 같이 해요"
                      value="${escapeHtml(f.title)}" />
             </div>`
          : ""
      }
      <div class="field">
        <label>${f.type === "proposal" ? "제안 내용" : "이야기"}</label>
        <textarea id="c-body" rows="6" placeholder="${
          f.type === "proposal" ? "언제, 어디서, 무엇을 함께할지 편하게 적어주세요." : "동네 이웃들과 나누고 싶은 이야기를 적어주세요."
        }">${escapeHtml(f.body)}</textarea>
      </div>
      <p class="form-hint">${
        f.type === "proposal"
          ? "제안글에는 이웃이 <b>‘같이할래요’</b>로 참여할 수 있어요. 글쓴이는 자동으로 첫 참여자가 돼요."
          : "가볍게 후기나 소식을 나눠보세요."
      }</p>
      <div class="action-dock">
        <button class="btn btn--primary" id="btn-submit">${f.type === "proposal" ? "제안 올리기" : "글 올리기"}</button>
      </div>
    `;

    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "list";
      state.tab = "sarangbang";
      syncTabbar();
      render();
    });
    els.view.querySelectorAll("#seg-type .seg__btn").forEach((b) =>
      b.addEventListener("click", () => {
        composeForm.title = valueOf("c-title", composeForm.title);
        composeForm.body = valueOf("c-body", composeForm.body);
        composeForm.type = b.dataset.t;
        renderCompose();
      })
    );
    on("btn-submit", submitPost);
    els.view.scrollTop = 0;
  }
  function submitPost() {
    const f = composeForm;
    f.title = valueOf("c-title", f.title).trim();
    f.body = valueOf("c-body", f.body).trim();
    if (f.type === "proposal" && !f.title) return toast("제안 제목을 적어주세요.");
    if (!f.body) return toast("내용을 적어주세요.");
    const post = {
      id: "u" + Date.now(),
      type: f.type,
      title: f.type === "proposal" ? f.title : "",
      body: f.body,
      author: myName(),
      region: myRegion(),
      createdAt: new Date().toISOString(),
      wantCount: 0,
      joinedBy: f.type === "proposal" ? [myName()] : [],
    };
    state.userPosts.push(post);
    saveStore();
    composeForm = null;
    state.view = "list";
    state.tab = "sarangbang";
    syncTabbar();
    toast(f.type === "proposal" ? "제안을 올렸어요! 🙌" : "글을 올렸어요.");
    render();
  }

  // ---------- 봉사 올리기 ----------
  const SLOTS = [
    { key: "am", label: "오전", time: "09:00 ~ 12:00", hours: 3 },
    { key: "pm", label: "오후", time: "13:00 ~ 16:00", hours: 3 },
    { key: "eve", label: "저녁", time: "18:00 ~ 20:00", hours: 2 },
    { key: "free", label: "자율", time: "자율", hours: 2 },
  ];
  const CAPS = [5, 10, 20, 30];

  function openCreate() {
    createForm = {
      title: "",
      category: "환경",
      region: myRegion(),
      dateMode: "this",
      customDate: ymd(nextSaturday(0)),
      slot: "am",
      capacity: 10,
      desc: "",
    };
    state.view = "create";
    render();
  }
  function createDate() {
    const f = createForm;
    if (f.dateMode === "this") return ymd(nextSaturday(0));
    if (f.dateMode === "next") return ymd(nextSaturday(1));
    return f.customDate;
  }
  function renderCreate() {
    const f = createForm;
    const cats = CATS.filter((c) => c !== "전체");
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 닫기</button>
      <div class="section-head">➕ 봉사 올리기</div>
      <div class="sb-intro">필요한 것만 톡톡 골라주세요. <b>3단계면 충분</b>해요.</div>

      <div class="field">
        <label>어떤 봉사인가요? <i>(제목)</i></label>
        <input id="a-title" type="text" maxlength="40" placeholder="예: 우리 동네 화단 물주기"
               value="${escapeHtml(f.title)}" />
      </div>

      <div class="field">
        <label>분야</label>
        <div class="pick" id="pick-cat">
          ${cats
            .map(
              (c) => `<button class="pick__btn ${f.category === c ? "is-on" : ""}" data-v="${c}">${c}</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="field">
        <label>동네</label>
        <input id="a-region" type="text" value="${escapeHtml(f.region)}" />
      </div>

      <div class="field">
        <label>언제</label>
        <div class="pick" id="pick-date">
          <button class="pick__btn ${f.dateMode === "this" ? "is-on" : ""}" data-v="this">이번 주말 (${fmtDate(ymd(nextSaturday(0)))})</button>
          <button class="pick__btn ${f.dateMode === "next" ? "is-on" : ""}" data-v="next">다음 주말</button>
          <button class="pick__btn ${f.dateMode === "custom" ? "is-on" : ""}" data-v="custom">직접</button>
        </div>
        ${
          f.dateMode === "custom"
            ? `<input id="a-date" type="date" style="margin-top:8px" value="${f.customDate}" />`
            : ""
        }
      </div>

      <div class="field">
        <label>시간대</label>
        <div class="pick" id="pick-slot">
          ${SLOTS.map(
            (s) =>
              `<button class="pick__btn ${f.slot === s.key ? "is-on" : ""}" data-v="${s.key}">${s.label} · ${s.time}</button>`
          ).join("")}
        </div>
      </div>

      <div class="field">
        <label>모집 인원</label>
        <div class="pick" id="pick-cap">
          ${CAPS.map(
            (c) => `<button class="pick__btn ${f.capacity === c ? "is-on" : ""}" data-v="${c}">${c}명</button>`
          ).join("")}
        </div>
      </div>

      <div class="field">
        <label>소개 <i>(선택)</i></label>
        <textarea id="a-desc" rows="4" placeholder="준비물, 모이는 곳 등을 적어주세요.">${escapeHtml(f.desc)}</textarea>
      </div>

      <div class="action-dock">
        <button class="btn btn--primary" id="btn-create">이 봉사 올리기</button>
      </div>
    `;

    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "list";
      state.tab = "home";
      syncTabbar();
      render();
    });
    pickBind("pick-cat", (v) => (f.category = v));
    pickBind("pick-date", (v) => (f.dateMode = v), true);
    pickBind("pick-slot", (v) => (f.slot = v));
    pickBind("pick-cap", (v) => (f.capacity = Number(v)));
    on("btn-create", submitActivity);
    els.view.scrollTop = 0;
  }
  function pickBind(id, setter, rerender) {
    const box = document.getElementById(id);
    if (!box) return;
    box.querySelectorAll(".pick__btn").forEach((b) =>
      b.addEventListener("click", () => {
        stashCreate();
        setter(b.dataset.v);
        if (rerender) renderCreate();
        else box.querySelectorAll(".pick__btn").forEach((x) => x.classList.toggle("is-on", x === b));
      })
    );
  }
  function stashCreate() {
    const f = createForm;
    if (!f) return;
    f.title = valueOf("a-title", f.title);
    f.region = valueOf("a-region", f.region);
    f.desc = valueOf("a-desc", f.desc);
    f.customDate = valueOf("a-date", f.customDate);
  }
  function submitActivity() {
    stashCreate();
    const f = createForm;
    const title = f.title.trim();
    if (!title) return toast("봉사 제목을 적어주세요.");
    const slot = SLOTS.find((s) => s.key === f.slot);
    const date = createDate();
    let dl = new Date(parseDate(date));
    dl.setDate(dl.getDate() - 2); // 마감은 활동 2일 전
    if (dl < TODAY) dl = new Date(TODAY); // 단, 과거로 가지 않게 (오늘까지 신청 가능)
    const act = {
      id: "my" + Date.now(),
      category: f.category,
      title,
      org: myName() + "의 동네제안",
      region: f.region.trim() || myRegion(),
      date,
      time: slot.time,
      hours: slot.hours,
      capacity: f.capacity,
      applied: 0,
      deadline: ymd(dl),
      points: Math.min(200, slot.hours * 30),
      desc: f.desc.trim() || "이웃이 올린 동네 봉사예요. 함께해요!",
    };
    state.myActivities.unshift(act);
    saveStore();
    createForm = null;
    state.view = "detail";
    state.detailId = act.id;
    state.tab = "home";
    syncTabbar();
    toast("봉사를 올렸어요! 이웃들에게 보여요 🎉");
    render();
  }

  // ---------- 나(프로필) ----------
  function renderMe() {
    const lv = levelInfo();
    const v = currentBrightness();
    const st = brightnessStage(v);
    const upcoming = [...state.applied].map(findActivity).filter(Boolean);
    upcoming.sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const plannedHours = upcoming.reduce((s, a) => s + (a.hours || 0), 0);

    const upcomingHtml = upcoming.length
      ? upcoming.map(cardHtml).join("")
      : `<div class="empty" style="padding:36px 20px">
           <div class="empty__icon">📋</div>
           <div class="empty__title">예정된 봉사가 없어요</div>
           <div>‘찾기’에서 마음에 드는 활동을 신청해보세요.</div>
         </div>`;

    const mineHtml = state.myActivities.length
      ? `<div class="section-head" style="margin-top:20px">➕ 내가 올린 봉사</div>` +
        state.myActivities.map(cardHtml).join("")
      : "";

    els.view.innerHTML = `
      <div class="profile">
        <div class="profile__avatar">${lv.cur.emoji}</div>
        <div class="profile__name">${escapeHtml(myName())}</div>
        <div class="profile__region">📍 ${escapeHtml(myRegion())}</div>
        <div class="profile__level">${lv.cur.emoji} <b>${lv.cur.name}</b></div>
        <div class="profile__bar"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
        <div class="profile__ptext">
          마음포인트 <b class="accent">${lv.pts}p</b>
          ${lv.next ? `· ${lv.next.name}까지 ${lv.toNext}p` : "· 최고 등급이에요!"}
        </div>
      </div>

      <div class="affirm">${affirmation()}</div>
      <button class="brag-btn" id="btn-brag">🔗 내 반디 자랑하기</button>

      ${
        !state.profile.signedUp
          ? `<button class="signup-banner" id="btn-signup">🌟 게스트로 둘러보는 중 — <b>가입하고 반디 시작하기 →</b></button>`
          : ""
      }

      <div class="stat3">
        <div class="stat3__box"><div class="stat3__num">🏮 ${lanternsTotal()}</div><div class="stat3__lbl">내가 켠 등불</div></div>
        <div class="stat3__box"><div class="stat3__num">${state.certificates.length}</div><div class="stat3__lbl">마음확인증</div></div>
        <div class="stat3__box"><div class="stat3__num">${totalCertHours()}</div><div class="stat3__lbl">함께한 시간</div></div>
      </div>

      <div class="mini-bright" style="background:linear-gradient(120deg, ${dawnColor(
        Math.max(0, v - 30)
      )}, ${dawnColor(v)})">
        <span>💡 우리 <b>${escapeHtml(currentDong())}</b> 전체 등불 <b>🏮 ${dongLanternTotal(currentDong())}</b> · ${st.emoji} ${st.name}</span>
        <button class="mini-bright__btn" id="btn-changedong">동네 바꾸기</button>
      </div>

      <div class="section-head" style="margin-top:20px">🏅 나의 뱃지</div>
      <div class="badges">
        ${badges()
          .map(
            (b) => `
          <div class="badge ${b.got ? "is-got" : ""}">
            <span class="badge__ic">${b.emoji}</span>
            <span class="badge__name">${escapeHtml(b.name)}</span>
            <span class="badge__desc">${b.got ? escapeHtml(b.desc) : "🔒 " + escapeHtml(b.desc)}</span>
          </div>`
          )
          .join("")}
      </div>

      ${(() => {
        const sv = [...state.saved].map(findActivity).filter(Boolean);
        return sv.length
          ? `<div class="section-head" style="margin-top:20px">💗 찜한 봉사 <span class="cnt">${sv.length}</span></div>` +
              sv.map(cardHtml).join("")
          : "";
      })()}

      <div class="section-head" style="margin-top:20px">🏮 나의 봉사 발자취</div>
      ${
        state.certificates.length
          ? [...state.certificates]
              .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))
              .map(
                (c) => `
              <div class="trace">
                <span class="trace__dot">🏮</span>
                <div class="trace__body">
                  <div class="trace__title">${escapeHtml(c.title)}</div>
                  <div class="trace__meta">${fmtDate(c.date)} · ${escapeHtml(dongOfRegion(c.region))} · ${c.hours}시간</div>
                  ${(() => {
                    const rv = state.reviews[c.activityId];
                    return rv
                      ? `<div class="trace__review">${rv.photo ? `<img src="${rv.photo}" alt="후기"/>` : ""}${rv.text ? `<span>“${escapeHtml(rv.text)}”</span>` : ""}</div>`
                      : "";
                  })()}
                </div>
              </div>`
              )
              .join("")
          : `<div class="mini-note">아직 발자취가 없어요. 첫 봉사를 시작해보세요 🌱</div>`
      }

      ${
        state.donationReceipts.length || state.recurring
          ? `<div class="section-head" style="margin-top:20px">🧾 나의 기부</div>
             <div class="donate-summary">
               <div class="donate-summary__total">누적 기부 <b>${fmtWon(myDonatedTotal())}</b></div>
               ${state.recurring ? `<div class="donate-summary__rec">🔁 매월 ${fmtWon(state.recurring.amount)} 정기 기부 중 · ${escapeHtml(state.recurring.dong)}</div>` : ""}
             </div>
             ${state.donationReceipts
               .map(
                 (r) => `<div class="receipt-row" data-receipt="${r.id}">
                 <span>🧾 ${escapeHtml(r.dong)} 이웃 기금</span>
                 <span class="receipt-row__amt">${fmtWon(r.amount)} ›</span>
               </div>`
               )
               .join("")}`
          : ""
      }

      <div class="section-head" style="margin-top:20px">📋 예정된 봉사 <span class="cnt">${upcoming.length}</span></div>
      ${upcoming.length ? `<div class="mini-note">예정 봉사시간 <b>${plannedHours}시간</b></div>` : ""}
      ${upcomingHtml}
      ${mineHtml}
    `;
    on("btn-changedong", () => buildOnboarding(3));
    on("btn-brag", shareBrag);
    on("btn-signup", () => buildOnboarding(4));
    els.view.querySelectorAll("[data-receipt]").forEach((el) =>
      el.addEventListener("click", () => openReceipt(el.dataset.receipt))
    );
    bindCards();
    els.view.scrollTop = 0;
  }

  // ---------- 액션 ----------
  function doApply(item) {
    if (isClosed(item)) return toast("이미 마감된 활동입니다.");
    state.applied.add(item.id);
    item.applied = Math.min(item.capacity, item.applied + 1);
    saveStore();
    toast("신청이 완료됐어요! 🎉");
    render();
  }
  function doCancel(item) {
    state.applied.delete(item.id);
    item.applied = Math.max(0, item.applied - 1);
    saveStore();
    toast("신청을 취소했어요.");
    render();
  }
  // 마음확인증 발급 (멱등) — 내 참여가 확정될 때
  function issueCert(item) {
    if (state.certificates.some((c) => c.activityId === item.id)) return false;
    const seq = String(state.certificates.length + 1).padStart(4, "0");
    state.certificates.push({
      certId: "MH-2026-" + seq,
      activityId: item.id,
      participant: myName(),
      title: item.title,
      org: item.org,
      region: item.region,
      category: item.category,
      date: item.date,
      hours: item.hours,
      points: item.points,
      issuedAt: new Date().toISOString(),
    });
    return true;
  }

  // ---------- 관리자(주최자) 출석 확인 ----------
  const APPLICANT_POOL = ["김이웃", "박봉사", "이하나", "최온기", "정새벽", "윤햇살", "오도움", "서나눔", "강마음", "한별"];
  function hashId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h;
  }
  function buildApplicants(act) {
    let seed = hashId(act.id);
    const n = 2 + (seed % 3); // 2~4명
    const pool = APPLICANT_POOL.slice();
    const names = [];
    for (let i = 0; i < n && pool.length; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      names.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return names.map((nm) => ({ name: nm, present: true }));
  }
  function getManaged(act) {
    let m = state.managed[act.id];
    if (!m) {
      m = { applicants: buildApplicants(act), done: false };
      state.managed[act.id] = m;
    }
    // 내가 신청한 봉사면 명단에 나를 포함
    if (state.applied.has(act.id) && !m.applicants.some((a) => a.me)) {
      m.applicants.unshift({ name: myName() + " (나)", present: true, me: true });
    }
    return m;
  }
  function openManager(id) {
    state.view = "manager";
    state.detailId = id;
    render();
  }
  function togglePresent(id, idx) {
    const act = findActivity(id);
    const m = getManaged(act);
    if (m.done) return;
    m.applicants[idx].present = !m.applicants[idx].present;
    saveStore();
    renderManager();
  }
  function managerConfirm(id) {
    const act = findActivity(id);
    const m = getManaged(act);
    if (m.done) return;
    const dong = dongOfRegion(act.region);
    let cnt = 0;
    m.applicants.forEach((a) => {
      if (!a.present) return;
      cnt++;
      if (a.me) {
        state.applied.delete(act.id);
        state.attended.add(act.id);
        issueCert(act); // 내 등불 + 마음확인증
      } else {
        state.communityLanterns[dong] = (state.communityLanterns[dong] || 0) + 1; // 이웃 등불
      }
    });
    m.done = true;
    saveStore();
    toast(`${cnt}명 출석 확정! ${escapeHtml(dong)}에 등불 ${cnt}개가 켜졌어요 🏮`);
    render();
  }
  function renderManager() {
    const act = findActivity(state.detailId);
    if (!act) return goList();
    const m = getManaged(act);
    const dong = dongOfRegion(act.region);
    const presentCount = m.applicants.filter((a) => a.present).length;
    const rows = m.applicants
      .map(
        (a, i) => `
        <button class="mgr-row ${a.present ? "is-on" : ""}" data-i="${i}" ${m.done ? "disabled" : ""}>
          <span class="mgr-row__avatar">${a.me ? "🙋" : "🧑"}</span>
          <span class="mgr-row__name">${escapeHtml(a.name)}</span>
          <span class="mgr-row__state">${a.present ? "✓ 출석" : "불참"}</span>
        </button>`
      )
      .join("");
    els.view.innerHTML = `
      <button class="detail__back" id="btn-back">← 뒤로</button>
      <div class="section-head">🛠️ 출석 관리</div>
      <div class="mgr-act">
        <div class="mgr-act__title">${escapeHtml(act.title)}</div>
        <div class="mgr-act__meta">📍 ${escapeHtml(act.region)}<br/>🗓️ ${fmtDate(act.date)} · ${escapeHtml(act.time)}</div>
      </div>
      <div class="notice">봉사가 끝난 뒤 참여한 이웃을 <b>출석 확인</b>해 주세요. 확정하면 참여자에게 마음확인증이 발급되고 <b>${escapeHtml(dong)}에 등불</b>이 켜져요.${m.done ? "" : " (이름을 눌러 출석/불참 전환)"}</div>
      <div class="mgr-list">${rows}</div>
      <div class="action-dock">
        ${
          m.done
            ? `<button class="btn btn--disabled" disabled>✅ 출석 확정 완료 (${presentCount}명)</button>`
            : `<button class="btn btn--primary" id="btn-confirm">출석 확정하기 (${presentCount}명)</button>`
        }
      </div>
    `;
    document.getElementById("btn-back").addEventListener("click", () => {
      state.view = "detail";
      render();
    });
    if (!m.done) {
      els.view.querySelectorAll(".mgr-row").forEach((r) =>
        r.addEventListener("click", () => togglePresent(act.id, Number(r.dataset.i)))
      );
      on("btn-confirm", () => managerConfirm(act.id));
    }
    els.view.scrollTop = 0;
  }

  // ---------- 내비게이션 ----------
  function saveReview(id) {
    const el = document.getElementById("rv-text");
    const t = (el ? el.value : "").trim();
    if (!t && !reviewPhoto) return toast("후기를 남겨주세요.");
    state.reviews[id] = { text: t || "", photo: reviewPhoto || null, at: new Date().toISOString() };
    reviewPhoto = null;
    saveStore();
    toast("따뜻한 후기 고마워요 ✍️");
    render();
  }
  function openDetail(id) {
    reviewPhoto = null;
    state.detailId = id;
    state.view = "detail";
    render();
  }
  function goList() {
    state.view = "list";
    state.detailId = null;
    render();
  }
  function openCert(certId) {
    state.certId = certId;
    state.view = "certDetail";
    render();
  }
  function backToCerts() {
    state.view = "list";
    state.tab = "certs";
    state.certId = null;
    syncTabbar();
    render();
  }

  // ---------- 공통 헬퍼 ----------
  function on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
  function valueOf(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  }
  function syncTabbar() {
    els.tabbar.querySelectorAll(".tabbar__item").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.tab === state.tab)
    );
  }

  // ---------- 탭/전역 이벤트 ----------
  els.tabbar.querySelectorAll(".tabbar__item").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      state.view = "list";
      state.detailId = null;
      state.certId = null;
      syncTabbar();
      render();
    })
  );
  els.fab.addEventListener("click", openCreate);

  // ---------- 시작 ----------
  render();
  if (!state.selectedDong) buildOnboarding(0); // 첫 방문 → 온보딩
  checkAuthSession(); // OAuth 리다이렉트 복귀 시 세션 반영
})();
