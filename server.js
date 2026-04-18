const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './Redesign FUN sports map/.env' });

const app = express();
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get('/api/events', async (req, res) => {
  const { data, error } = await supabase.from('games').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
