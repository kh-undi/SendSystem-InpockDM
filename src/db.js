// [요청] Supabase 메인 DB 이전 — 클라이언트 싱글톤
// service_role 키를 사용하므로 서버 사이드 전용. 브라우저/프론트엔드로 import 금지.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env에 없음. ' +
    '프로젝트 루트의 .env 파일을 확인하세요.'
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

module.exports = { supabase };
