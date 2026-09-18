import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

function getTransitiveImports(entryFile: string, rootDir: string): { files: Set<string>; packages: Set<string> } {
  const visitedFiles = new Set<string>()
  const importedPackages = new Set<string>()

  function resolvePath(currentFile: string, importSpecifier: string): string | null {
    let resolvedBase: string
    if (importSpecifier.startsWith('@/')) {
      resolvedBase = path.resolve(rootDir, importSpecifier.slice(2))
    } else if (importSpecifier.startsWith('.')) {
      resolvedBase = path.resolve(path.dirname(currentFile), importSpecifier)
    } else {
      importedPackages.add(importSpecifier)
      return null
    }

    const candidateExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']
    for (const ext of candidateExtensions) {
      const candidate = resolvedBase + ext
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate
      }
    }
    return null
  }

  function extractSpecifiers(content: string): string[] {
    const specifiers = new Set<string>()

    // Use TypeScript AST preprocessor to extract:
    // 1. static imports
    // 2. side-effect imports
    // 3. re-exports
    // 4. dynamic import(...)
    // 5. CommonJS require(...)
    const preprocessed = ts.preProcessFile(content, true, true)
    for (const item of preprocessed.importedFiles) {
      specifiers.add(item.fileName)
    }

    // Additional defense-in-depth regexes for dynamic imports and requires
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    let match: RegExpExecArray | null
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      specifiers.add(match[1])
    }

    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = requireRegex.exec(content)) !== null) {
      specifiers.add(match[1])
    }

    return Array.from(specifiers)
  }

  function traverse(filePath: string) {
    if (visitedFiles.has(filePath)) return
    visitedFiles.add(filePath)

    const content = fs.readFileSync(filePath, 'utf-8')
    const specifiers = extractSpecifiers(content)
    for (const specifier of specifiers) {
      const resolved = resolvePath(filePath, specifier)
      if (resolved && !visitedFiles.has(resolved)) {
        traverse(resolved)
      }
    }
  }

  traverse(path.resolve(rootDir, entryFile))
  return { files: visitedFiles, packages: importedPackages }
}

describe('transitive dependency-boundary isolation', () => {
  const rootDir = path.resolve(__dirname, '..')

  const FORBIDDEN_FILES = [
    'scheduled-import.ts',
    'import-pipeline.ts',
    'pdf-extraction.ts',
    'supabase-persistence.ts',
    'server.ts', // Discovery route must not import the broad server barrel
  ]

  const FORBIDDEN_PACKAGES = [
    '@supabase/supabase-js',
    '@supabase/ssr',
    'pdfjs-dist',
  ]

  test('app/api/cron/grade-threshold-discovery/route.ts has zero transitive dependency on mutating modules', () => {
    const { files, packages } = getTransitiveImports(
      'app/api/cron/grade-threshold-discovery/route.ts',
      rootDir,
    )

    const resolvedFileNames = Array.from(files).map((f) => path.basename(f))

    for (const forbidden of FORBIDDEN_FILES) {
      expect(
        resolvedFileNames,
        `Discovery route must not transitively import ${forbidden}`,
      ).not.toContain(forbidden)
    }

    for (const forbiddenPkg of FORBIDDEN_PACKAGES) {
      expect(
        packages,
        `Discovery route must not transitively import package ${forbiddenPkg}`,
      ).not.toContain(forbiddenPkg)
    }
  })

  test('lib/grade-thresholds/discovery-runner.ts has zero transitive dependency on mutating modules', () => {
    const { files, packages } = getTransitiveImports(
      'lib/grade-thresholds/discovery-runner.ts',
      rootDir,
    )

    const resolvedFileNames = Array.from(files).map((f) => path.basename(f))

    for (const forbidden of FORBIDDEN_FILES) {
      expect(
        resolvedFileNames,
        `Discovery runner must not transitively import ${forbidden}`,
      ).not.toContain(forbidden)
    }

    for (const forbiddenPkg of FORBIDDEN_PACKAGES) {
      expect(
        packages,
        `Discovery runner must not transitively import package ${forbiddenPkg}`,
      ).not.toContain(forbiddenPkg)
    }
  })

  test('lib/grade-thresholds/cron-auth.ts is an isolated leaf module', () => {
    const { files, packages } = getTransitiveImports(
      'lib/grade-thresholds/cron-auth.ts',
      rootDir,
    )

    const resolvedFileNames = Array.from(files).map((f) => path.basename(f))
    expect(resolvedFileNames).toEqual(['cron-auth.ts'])
    const thirdPartyPackages = Array.from(packages).filter(
      (p) => !p.startsWith('node:') && p !== 'server-only',
    )
    expect(thirdPartyPackages).toEqual([])
  })

  test('lib/grade-thresholds/cambridge-host-policy.ts is an isolated dependency-free leaf module', () => {
    const { files, packages } = getTransitiveImports(
      'lib/grade-thresholds/cambridge-host-policy.ts',
      rootDir,
    )

    const resolvedFileNames = Array.from(files).map((f) => path.basename(f))
    expect(resolvedFileNames).toEqual(['cambridge-host-policy.ts'])
    expect(packages.size).toBe(0)
  })
})
