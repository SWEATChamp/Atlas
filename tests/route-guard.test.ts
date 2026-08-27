import { describe, expect, test } from 'vitest'
import { evaluateProxyRouteRule, PROTECTED_PREFIXES, AUTH_ROUTES } from '../lib/auth/route-guard'

describe('proxy route guard evaluation', () => {
  test('redirects unauthenticated users from protected routes to /login with next param', () => {
    for (const route of PROTECTED_PREFIXES) {
      const decision = evaluateProxyRouteRule({
        pathname: route,
        hasValidClaims: false,
      })
      expect(decision).toEqual({
        action: 'redirect',
        destination: '/login',
        searchParams: { next: route },
      })
    }

    const subRouteDecision = evaluateProxyRouteRule({
      pathname: '/subjects/9709',
      hasValidClaims: false,
    })
    expect(subRouteDecision).toEqual({
      action: 'redirect',
      destination: '/login',
      searchParams: { next: '/subjects/9709' },
    })
  })

  test('allows unauthenticated users on auth routes like /login', () => {
    for (const route of AUTH_ROUTES) {
      const decision = evaluateProxyRouteRule({
        pathname: route,
        hasValidClaims: false,
      })
      expect(decision).toEqual({
        action: 'next',
      })
    }
  })

  test('redirects authenticated users from /login to /dashboard', () => {
    const decision = evaluateProxyRouteRule({
      pathname: '/login',
      hasValidClaims: true,
    })
    expect(decision).toEqual({
      action: 'redirect',
      destination: '/dashboard',
    })
  })

  test('allows authenticated users through protected routes', () => {
    const routes = ['/dashboard', '/subjects', '/subjects/9709', '/past-papers', '/onboarding']
    for (const route of routes) {
      const decision = evaluateProxyRouteRule({
        pathname: route,
        hasValidClaims: true,
      })
      expect(decision).toEqual({
        action: 'next',
      })
    }
  })
})
