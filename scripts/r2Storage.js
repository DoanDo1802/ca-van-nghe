import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

async function signedR2Request(cfg, method, key, body = null, extraHeaders = {}) {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${cfg.bucket}/${key.replace(/^\/+/, '')}`;
  const endpoint = `https://${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body ? sha256Hex(body) : sha256Hex('');

  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };

  const sortedKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])
  );
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${lowerHeaders[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = getSigningKey(cfg.secretAccessKey, dateStamp, 'auto', 's3');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(endpoint, {
    method,
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body,
  });
}

export async function checkR2KaraokeObject(id) {
  const cfg = getR2Config();
  if (!cfg) return null;
  const key = `karaoke/${id}.mp4`;
  try {
    const res = await signedR2Request(cfg, 'HEAD', key);
    if (res.ok) {
      return `${cfg.publicUrl}/${key}`;
    }
  } catch {
    // ignore transient R2 head error
  }
  return null;
}

export async function uploadFileToR2Karaoke(id, filePath) {
  const cfg = getR2Config();
  if (!cfg) return null;
  const key = `karaoke/${id}.mp4`;
  const body = await readFile(filePath);
  const res = await signedR2Request(cfg, 'PUT', key, body, {
    'content-type': 'video/mp4',
    'cache-control': 'public, max-age=604800',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 PUT failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return `${cfg.publicUrl}/${key}`;
}
