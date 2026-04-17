import { middleware as supabaseMiddleware } from './lib/supabase/middleware'

export default supabaseMiddleware

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
