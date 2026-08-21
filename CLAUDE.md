# 반디 (Bandi)

> 작은 봉사 하나가 반디 한 마리. 우리 동네를 밤에서 새벽으로 밝히는 동네 봉사·기부 매칭 앱.

## 브랜드
- **앱 이름**: 반디 (반딧불이 — 스스로 빛나는 작은 존재. "반디=반짝"에서 온 순우리말)
- **한 줄**: 우리 동네를 밝히는 봉사
- **단위**: **등불**(🏮) — 봉사 참여 1건 = 등불 1개. 동네 전체 등불이 쌓일수록 밤하늘이 밝아짐
- **비유**: 깜깜한 밤 → 이웃들의 봉사·기부가 모이면 동이 트듯 동네가 밝아진다 (온보딩의 핵심)

## 지금 형태 (중요)
**서버 없는 순수 정적 PWA**. Expo/React Native 아님.
- `index.html` + `assets/{styles.css, data.js, app.js, supabase-config.js}` + 아이콘 + `sw.js` + `manifest.webmanifest`
- 상태는 전부 **localStorage** (`maeumdongne_v1` 키 — 과거 이름 유지). 서버·빌드·번들러 없음.
- 실행: `python -m http.server 8777` → http://localhost:8777
- 배포: **GitHub Pages** → https://jaen0709.github.io/maeum-dongne/ (repo: `maeum-dongne`, main 브랜치)
- 정적 자원은 `?v=NN` 쿼리로 캐시 무효화 (index.html). **JS/CSS 바꾸면 v 번호 올릴 것.**

## 제품 원칙
1. **양방향 심플** — 참여도, 봉사 올리기도 3단계 이내. 프리셋 칩 우선.
2. **활동 중심 커뮤니티** — 사랑방 기본값은 "이거 같이 해볼래?"(활동 제안).
3. **밝아지는 동네** — 개인 실적이 아니라 "우리가 함께 밝힌다"(등불·밝기 지수).
4. **셀프 완료 금지** — 참여 완료는 본인이 아니라 **주최자(관리자)가 출석 확인**해야 확정.
5. **비공식 인증** — 마음확인증은 공식 봉사시간 인증이 아님. 고지 문구(`DISCLAIMER`) 항상 노출.
6. **기부는 데모** — 실제 결제 없음. "데모" 고지 유지 (실서비스는 기부금품법 등 법적 검토 필요).

## 화면 (하단 5탭 + FAB)
| 탭/뷰 | 내용 |
|---|---|
| 🏠 홈(dashboard) | 인사·밤하늘 밝기·통계·빠른액션·**이웃 기금(기부·목표)**·기금 사용처·**동네 랭킹**·마감임박 |
| 🔍 찾기(find) | 검색·카테고리·마감임박순 카드(찜 하트 포함) |
| 💬 사랑방(sarangbang) | 제안/자유글 피드 → **글 상세+댓글**, 같이할래요 |
| 🏮 등불(certs) | 내 등불 총합·동네별·마음확인증 카드 → 확인증 상세(고지) |
| 🌱 나(me) | 프로필·**칭찬 메시지**·자랑하기·업적 뱃지·찜한 봉사·**봉사 발자취(후기)**·기부 내역 |
| ➕ FAB | 봉사 올리기 (홈에서만 노출) |
| 그 외 뷰 | detail / manager(출석) / donate / receipt / ranking / postDetail |

## 핵심 로직 (`assets/app.js`, 단일 IIFE)
- **동/밝기/색**: `dongBrightness`(0~100) → `dawnColor`(밤→새벽 보간). `dongLanternTotal`=시드+새 등불.
- **등불**: 확인증 1개=등불 1개. `lanternsTotal`(내), `communityLanterns`(이웃 확정분).
- **온보딩**: 5스텝(슬라이드3→동선택→소셜가입). ✕ 건너뛰기. 위치기반 동 정렬(Geolocation, 거부 시 마포구). `buildOnboarding(step)`.
- **가입/로그인**: 소셜 버튼(카카오·구글·애플). **Supabase Auth 연동됨** — provider 켜지면 실동작, 아니면 데모 폴백. 로그아웃 없음(로그인 유지).
- **관리자 출석**: `getManaged`(신청자=데모 이웃+나) → `managerConfirm`(출석분 등불 점등, 나는 마음확인증 발급).
- **기부**: `doDonate`(동네 기금↑ + 영수증 발급 + 정기기부 옵션). `dongGoal` 목표 진행률.
- **후기**: `saveReview`(참여완료 봉사에 한줄+사진, `readPhoto`로 900px 리사이즈). 발자취에 표시.
- **뱃지/자랑/랭킹**: `badges()`, `shareBrag()`(Web Share/클립보드), `ranking()`.
- **찜/댓글**: `toggleSave`, `postComments`.

## Supabase 인증 (`assets/supabase-config.js`)
- `url`, `anonKey`(publishable) 채우면 활성. 현재 프로젝트: `etlyqnnqtqenzxaxgwem`.
- **provider는 아직 미설정** → 지금은 데모 로그인. Supabase Authentication→Providers에서 Google/Kakao 켜면 실동작.
- `fetchProviders()`가 켜진 제공자 감지 → 미설정 제공자 클릭 시 데모로 폴백.
- OAuth 복귀 시 `checkAuthSession()`이 세션→프로필 반영.
- ⚠️ **secret key(`sb_secret_`)는 절대 클라이언트/저장소에 넣지 말 것.**

## 데이터 (`assets/data.js`)
- `VOLUNTEER_DATA`(봉사 8건), `SARANGBANG_SEED`(3건), `MD_CONFIG`(today 데모 기준일 2026-08-14, me, district, **dongs**[brightness/lanterns/donations/lat/lng], categories, levels, brightnessStages, dawnScale, fundUses, donationPresets).

## 코딩 컨벤션
- UI·주석 **한국어**, 따뜻한 존댓말. 색상은 CSS 변수(오렌지 테마 `--orange` 등)로.
- 외부 라이브러리 추가 금지(Supabase-js CDN 제외). 순수 정적 유지.
- 렌더는 `render()` 라우터 → 화면별 `render*()`. innerHTML 후 이벤트 바인딩.
- **바꾼 뒤 반드시**: 브라우저에서 동작 확인 + `index.html`의 `?v=` 올리기 + 커밋/푸시.

## 다음 단계(미구현)
- 실제 소셜 로그인(provider 설정), 서버/DB(현재 localStorage), 푸시 알림, 후기/랭킹 커뮤니티 확장.
