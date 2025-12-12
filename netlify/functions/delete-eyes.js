const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;
  
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token required' }) };
  }

  try {
    // Ищем CID по токену
    const { data, error } = await supabase
      .from('delete_tokens')
      .select('cid')
      .eq('delete_token', token)
      .single();

    if (error || !data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Token not found or already used' }) };
    }

    const cid = data.cid;

    // Удаляем из обеих таблиц
    await supabase.from('eyes').delete().eq('cid', cid);
    await supabase.from('delete_tokens').delete().eq('delete_token', token);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Eyes deleted forever' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
