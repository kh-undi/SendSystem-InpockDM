// [요청] 추천 카탈로그 페이지 — Supabase 공개 키 설정
// ⚠️ 여기 anon key만 들어가야 함. service_role key는 절대 금지.
// anon key는 RLS + SECURITY DEFINER RPC로 보호되므로 공개해도 안전.
//
// 1. Supabase Dashboard → Project Settings → API
// 2. "Project URL" → SUPABASE_URL
// 3. "Project API keys" 섹션의 "anon public" → SUPABASE_ANON_KEY
//
// Vercel에 배포할 때는 이 파일을 그대로 푸시 (env 변수 별도 설정 불필요).
// 로컬에서 server.js로 테스트할 때는 http://localhost:3000/recommend/?c=<code>로 접근.

window.SUPABASE_URL = 'https://jejpnuzspprufbwwdvsl.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplanBudXpzcHBydWZid3dkdnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MzcxMTcsImV4cCI6MjA5MjQxMzExN30.TZiq-EQgGCOKZvmebgO_V7lQ4LkseX-6WgJYuaqpskg';
