import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { roleCanAccessAdmin, roleCanAccessPortal } from '@/lib/auth-roles'

/**
 * Next.js middleware — runs on every non-static request.
 *
 * Routing rules:
 *  - /admin/login         → public (admin sign-in page)
 *  - /admin/**            → requires an active authenticated superadmin; others → /admin/login
 *  - /calendar, /day,
 *    /analysis,
 *    /my-entries,
 *    /profile             → requires an active company_admin/viewer session → /login
 *  - /login               → public (portal sign-in); active portal users are
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
  const portalPaths = ['/calendar', '/day', '/analysis', '/my-entries', '/profile']
  const isPortalPath = portalPaths.some((portalPath) => pathname.startsWith(portalPath))
  const userId = user?.id
  const needsProfile = Boolean(
    userId && (pathname.startsWith('/admin') || isPortalPath || pathname === '/login'),
  )
  const { data: profile } = needsProfile
    ? await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('user_id', userId)
        .maybeSingle()
    : { data: null }

  const canAccessAdmin = Boolean(profile?.is_active && roleCanAccessAdmin(profile.role))
  const canAccessPortal = Boolean(profile?.is_active && roleCanAccessPortal(profile.role))

  // ── Admin section ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    if (!canAccessAdmin) {
      const url = new URL('/admin/login', request.url)
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  // ── Portal section ─────────────────────────────────────────────────────────
  if (isPortalPath && !canAccessPortal) {
    const url = new URL('/login', request.url)
    if (user) url.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(url)
  }

  // ── Redirect already-authorized users away from login pages ───────────────
  if (user && pathname === '/login' && canAccessPortal) {
    return NextResponse.redirect(new URL('/calendar', request.url))
  }
  if (user && pathname === '/admin/login' && canAccessAdmin) {
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
