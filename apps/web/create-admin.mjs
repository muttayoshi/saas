import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function createAdmin() {
  const { data, error } = await supabase.auth.signUp({
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    options: {
      data: {
        role: 'admin',
        full_name: 'Admin',
      },
    },
  })

  if (error) {
    console.error('Error creating admin:', error.message)
    process.exit(1)
  }

  console.log('Successfully created admin user:', data.user.email)
}

createAdmin()
