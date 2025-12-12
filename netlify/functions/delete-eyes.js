// Netlify Function: Delete eyes by token
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Token required" }) };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Find CID by token
    const { data: tokenData, error: findError } = await supabase
      .from("delete_tokens")
      .select("cid")
      .eq("delete_token", token)
      .single();

    if (findError || !tokenData) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Token not found or already used" }) };
    }

    const cid = tokenData.cid;

    // Delete from eyes table
    await supabase.from("eyes").delete().eq("cid", cid);

    // Delete token
    await supabase.from("delete_tokens").delete().eq("delete_token", token);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Eyes deleted forever" }),
    };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
