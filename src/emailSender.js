const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../config');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailAddress(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

function loadEmailAccounts() {
  if (!fs.existsSync(config.PATHS.emailAccounts)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.PATHS.emailAccounts, 'utf-8'));
  } catch {
    return [];
  }
}

function findEmailAccount(id) {
  const list = loadEmailAccounts();
  if (id == null) return list[0] || null;
  const idNum = Number(id);
  return list.find(a => a.id === idNum) || null;
}

function buildSubject(product) {
  if (product.mailSubject && product.mailSubject.trim()) {
    return product.mailSubject.trim();
  }
  return `${config.MAIL_SUBJECT_PREFIX} ${product.name} ${config.MAIL_SUBJECT_SUFFIX}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function buildSignatureHtml(emailAccount) {
  const sig = (emailAccount.signature || '').trim();
  const sigImage = emailAccount.signatureImage;
  if (!sig && !sigImage) return '';

  // HTML 태그가 이미 있으면 그대로, 아니면 줄바꿈만 변환
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(sig);
  const textHtml = sig ? (looksLikeHtml ? sig : escapeHtml(sig).replace(/\n/g, '<br>')) : '';
  const imageHtml = sigImage && fs.existsSync(sigImage)
    ? `<div style="margin-top:8px"><img src="cid:signatureImg" style="max-width:400px"></div>`
    : '';

  return `<br><br><div style="color:#5f6368;font-size:13px;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:16px">
    ${textHtml}
    ${imageHtml}
  </div>`;
}

function buildSignatureAttachments(emailAccount) {
  const sigImage = emailAccount.signatureImage;
  if (!sigImage || !fs.existsSync(sigImage)) return [];
  return [{
    filename: path.basename(sigImage),
    path: sigImage,
    cid: 'signatureImg',
  }];
}

function buildHtmlBody(product, emailAccount) {
  const body = escapeHtml(product.offerMessage || '').replace(/\n/g, '<br>');
  const linked = linkify(body);
  const photos = Array.isArray(product.photos) ? product.photos : [];
  const imgs = photos
    .map((_, i) => `<div style="margin-bottom:8px"><img src="cid:photo${i}" style="max-width:600px;width:100%;border-radius:8px"></div>`)
    .join('');
  const signature = buildSignatureHtml(emailAccount);
  return `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a">
    ${imgs}
    ${imgs ? '<br>' : ''}
    <div>${linked}</div>
    ${signature}
  </div>`;
}

function buildAttachments(product) {
  const photos = Array.isArray(product.photos) ? product.photos : [];
  return photos
    .filter(p => p && fs.existsSync(p))
    .map((p, i) => ({
      filename: path.basename(p),
      path: p,
      cid: `photo${i}`,
    }));
}

function createTransport(emailAccount) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailAccount.email,
      pass: emailAccount.appPassword,
    },
  });
}

async function sendMail(emailAccount, influencer, product) {
  const label = `[${emailAccount.email}] [메일] ${influencer.nickname}`;
  const to = (influencer.profileUrl || '').trim();
  console.log(`${label} 발송 시작 → ${to}`);

  if (!isEmailAddress(to)) {
    return { success: false, error: '유효하지 않은 이메일 주소' };
  }

  try {
    const transporter = createTransport(emailAccount);
    const info = await transporter.sendMail({
      from: `"${emailAccount.senderName || emailAccount.email}" <${emailAccount.email}>`,
      to,
      bcc: config.MAIL_BCC,
      subject: buildSubject(product),
      html: buildHtmlBody(product, emailAccount),
      attachments: [
        ...buildAttachments(product),
        ...buildSignatureAttachments(emailAccount),
      ],
    });
    console.log(`${label} 발송 성공! (messageId: ${info.messageId})`);
    return { success: true };
  } catch (error) {
    console.error(`${label} 발송 실패:`, error.message);
    return { success: false, error: error.message };
  }
}

async function verifyTransport(emailAccount) {
  const transporter = createTransport(emailAccount);
  await transporter.verify();
}

module.exports = {
  isEmailAddress,
  loadEmailAccounts,
  findEmailAccount,
  sendMail,
  verifyTransport,
  buildSubject,
};
