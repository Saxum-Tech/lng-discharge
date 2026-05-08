import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js middleware — runs on every non-static request.
 *
 * Routing rules:
 *  - /admin/login         → public (admin sign-in page)
 *  - /admin/**            → requires authenticated superadmin; non-admins → /admin/login
 *  - /calendar, /day,
 *    /analysis,
 *    /my-entries,
 *    /profile             → requires any authenticated session → /login
 *  - /login               → public (portal sign-in); authenticated users are
 *                           redirected to /calendar
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Always call getUser() — not getSession() — for security in middleware.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Admin section ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    // Verify the caller holds the superadmin role.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile?.role !== 'superadmin') {
      const url = new URL('/admin/login', request.url)
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  // ── Portal section ─────────────────────────────────────────────────────────
  const portalPaths = ['/calendar', '/day', '/analysis', '/my-entries', '/profile']
  if (portalPaths.some((p) => pathname.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Redirect already-authenticated users away from login pages ────────────
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/calendar', request.url))
  }
  if (user && pathname === '/admin/login') {
    return NextResponse.redirect(new URL('/admin/companies', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico   (favicon)
     *  - public assets (svg, png, jpg, …)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
