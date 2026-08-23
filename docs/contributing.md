# Contributing Guide

## Branch Strategy
Use descriptive prefixes for all branches:
- `feature/` - New features or pages
- `fix/` - Bug fixes
- `chore/` - Tooling, configuration, or minor refactors

## Commit Messages
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: add google docs integration`
- `fix: resolve hydration error on dashboard`
- `docs: update ui guidelines`

## Pull Request Process
1. Ensure your code passes TypeScript strict checks (`tsc --noEmit`).
2. Run linters (`npm run lint` / `npm run format`).
3. Describe your changes clearly in the PR description, linking to relevant issues.
4. Request review from a maintainer.

## Code Style
- **TypeScript**: Strict mode is ON. Avoid `any`.
- **Formatting**: Rely on Prettier and ESLint.
- **Components**: Follow the existing shadcn/ui patterns. Keep components small and focused.

## Database Changes
If you need to change the database schema:
1. Generate a new migration file:
   ```bash
   supabase migration new descriptive_name
   ```
2. Write raw SQL. Ensure operations are idempotent where possible.
3. If adding a new Achievement:
   - Add it to the seed file or create a migration inserting into `achievement_definitions`.
   - Update the `check_and_unlock_achievements` PostgreSQL function to handle the new condition.
