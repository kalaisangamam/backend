// One-time bootstrap script: creates the first admin account.
// Usage: node scripts/createAdmin.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');

(async () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const email = process.env.ADMIN_EMAIL;

  if (!password) {
    console.error('Set ADMIN_PASSWORD in backend/.env before running this script.');
    process.exit(1);
  }

  const { data: existing } = await supabase.from('users').select('id').eq('username', username).single();
  if (existing) {
    console.log(`Admin user "${username}" already exists. Nothing to do.`);
    process.exit(0);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({ role: 'admin', username, email, password_hash })
    .select()
    .single();

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`Admin user created: ${data.username} (id: ${data.id})`);
  process.exit(0);
})();
