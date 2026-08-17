// ────────────────────────────────────────────────────────────
//  반디 · Supabase 소셜 로그인 설정
//  아래 두 값을 채우면 카카오/구글/애플 "실제" 로그인이 동작해요.
//  (비워두면 데모 로그인으로 동작합니다.)
//
//  값 얻는 곳: Supabase 대시보드 → Project Settings → API
//    - url:     Project URL       (예: https://abcxyz.supabase.co)
//    - anonKey: anon public key   (eyJhbGciOi... 로 시작하는 긴 문자열)
//
//  그리고 Supabase → Authentication → Providers 에서
//  Google / Kakao / Apple 을 켜고, Redirect URL 에
//  https://jaen0709.github.io/maeum-dongne/  를 등록하세요.
// ────────────────────────────────────────────────────────────
window.SUPABASE_CONFIG = {
  url: "",
  anonKey: "",
};
