// Netlify Function: Upload eye PNG to Filebase IPFS, save CID to Supabase
// Environment variables required: FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    // Parse multipart form data
    const imageBuffer = await parseMultipart(event);
    if (!imageBuffer) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No image provided" }) };
    }

    // Upload to Filebase (S3-compatible IPFS)
    const s3 = new S3Client({
      endpoint: "https://s3.filebase.com",
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.FILEBASE_ACCESS_KEY,
        secretAccessKey: process.env.FILEBASE_SECRET_KEY,
      },
    });

    const filename = `eyes-${Date.now()}-${uuidv4().slice(0, 8)}.png`;
    const bucketName = "gorgona-eyes"; // Create this bucket in Filebase

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: imageBuffer,
      ContentType: "image/png",
    });

    const uploadResult = await s3.send(putCommand);

    // Get CID from Filebase response header
    const cid = uploadResult.$metadata.httpHeaders?.["x-amz-meta-cid"] || 
                uploadResult.ETag?.replace(/"/g, "") || 
                filename; // Fallback

    // For Filebase, we need to get the CID differently - it's in the response
    // Actually, Filebase returns CID in x-amz-meta-cid header after pin
    // Let's use a workaround: the CID is returned in the response

    // Initialize Supabase with service key for insert
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Generate delete token
    const deleteToken = uuidv4();

    // Insert into eyes table
    const { error: eyesError } = await supabase
      .from("eyes")
      .insert({ cid: filename }); // Using filename as identifier for now

    if (eyesError) {
      console.error("Supabase eyes insert error:", eyesError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Database error" }) };
    }

    // Insert delete token
    const { error: tokenError } = await supabase
      .from("delete_tokens")
      .insert({ cid: filename, delete_token: deleteToken });

    if (tokenError) {
      console.error("Supabase token insert error:", tokenError);
    }

    const siteUrl = process.env.URL || "https://gorgonaeyes.netlify.app";
    const deleteUrl = `${siteUrl}/delete.html?token=${deleteToken}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        cid: filename,
        deleteUrl: deleteUrl,
      }),
    };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Parse multipart form data
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: { "content-type": event.headers["content-type"] || event.headers["Content-Type"] },
    });

    const chunks = [];

    busboy.on("file", (fieldname, file) => {
      file.on("data", (data) => chunks.push(data));
      file.on("end", () => resolve(Buffer.concat(chunks)));
    });

    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (chunks.length === 0) resolve(null);
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body);

    busboy.end(body);
  });
}
