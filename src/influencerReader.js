const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const config = require('../config');

/**
 * influencers.csv 파일 읽기
 *
 * CSV 형식 (구글 시트에서 복사 붙여넣기 가능):
 *   nickname,profileUrl,productName
 *   홍길동,https://influencer.influclink.com/profile/12345,상품A
 *
 * 탭으로 구분된 형식도 지원 (구글 시트에서 직접 복사 시)
 */
function readInfluencers(filePath) {
  const raw = fs.readFileSync(filePath || config.PATHS.influencers, 'utf-8');

  // 탭 구분인지 콤마 구분인지 자동 감지
  const firstLine = raw.split('\n')[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
  });

  // 유효성 검사
  const valid = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (!row.nickname || !row.profileUrl || !row.productName) {
      console.warn(`[경고] ${i + 2}번째 줄 데이터 누락, 건너뜀:`, row);
      continue;
    }
    valid.push({
      nickname: row.nickname.trim(),
      profileUrl: row.profileUrl.trim(),
      productName: row.productName.trim(),
    });
  }

  console.log(`[인플루언서] 총 ${valid.length}명 로드 완료`);
  return valid;
}

/**
 * JSON 또는 CSV에서 자동으로 인플루언서 목록 로드
 * - influencers.json이 있고 비어있지 않으면 JSON 우선
 * - 없으면 influencers.csv fallback
 */
function readInfluencersAuto() {
  const jsonPath = path.join(path.dirname(config.PATHS.influencers), 'influencers.json');
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (Array.isArray(data) && data.length > 0) {
      const valid = data.filter(r => r.nickname && r.profileUrl && r.productName);
      console.log(`[인플루언서] JSON에서 ${valid.length}명 로드 완료`);
      return valid;
    }
  }
  return readInfluencers();
}

module.exports = { readInfluencers, readInfluencersAuto };
