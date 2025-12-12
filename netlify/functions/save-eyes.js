// Netlify Function: загрузка видео на Filebase IPFS + сохранение в Supabase
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const busboy = require('busboy');

const s3 = new S3Client({
  endpoint: 'https://s3.filebase.io',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY
  }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Парсим multipart form data
    const { fileBuffer, filename, contentType } = await parseMultipart(event);
    
    const fileKey = `eyes-${Date.now()}-${uuidv4().slice(0,8)}.webm`;
    
    // Загружаем на Filebase IPFS
    await s3.send(new PutObjectCommand({
      Bucket: 'gorgona-eyes',
      Key: fileKey,
      Body: fileBuffer,
      ContentType: contentType || 'video/webm'
    }));

    // Получаем CID из Filebase (через HEAD запрос или используем filename как placeholder)
    // Filebase возвращает CID в x-amz-meta-cid заголовке
    const cid = fileKey; // Временно используем fileKey, Filebase даст CID

    // Генерируем токен удаления
    const deleteToken = uuidv4();

    // Сохраняем в Supabase
    const { error: eyesError } = await supabase
      .from('eyes')
      .insert({ cid: cid, type: 'video' });

    if (eyesError) throw eyesError;

    const { error: tokenError } = await supabase
      .from('delete_tokens')
      .insert({ cid: cid, delete_token: deleteToken });

    if (tokenError) throw tokenError;

    const siteUrl = process.env.URL || 'https://gorgonaeyes.netlify.app';
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        cid: cid,
        deleteUrl: `${siteUrl}/delete.html?token=${deleteToken}`
      })
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ 
      headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
    });
    
    let fileBuffer = null;
    let filename = '';
    let contentType = '';
    const chunks = [];

    bb.on('file', (name, file, info) => {
      filename = info.filename;
      contentType = info.mimeType;
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', () => resolve({ fileBuffer, filename, contentType }));
    bb.on('error', reject);

    const body = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64') 
      : Buffer.from(event.body);
    bb.end(body);
  });
}
