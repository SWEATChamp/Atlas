'use client'

import { MotionConfig } from 'framer-motion'

/**
 * Wraps the subtree in Framer Motion's MotionConfig configured with reducedMotion="user".
 * This ensures all JS-driven Framer Motion transforms and physics animations respect
 * the user's OS-level prefers-reduced-motion setting automatically.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
