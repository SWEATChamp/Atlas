# Deployment Guide

## Overview
Atlas is deployed on **Vercel** (frontend / Edge layer) and **Supabase** (backend / PostgreSQL).

## 1. Supabase Production Setup
1. Create a new production project in Supabase.
2. Link the production database:
   ```bash
   supabase link --project-ref YOUR_PROD_PROJECT_REF
   ```
3. Push migrations to production:
   ```bash
   supabase db push --linked
   ```
4. **Auth Settings**:
   - Enable Email Signups.
   - Configure Google OAuth Provider (add Client ID & Secret).
   - Set Site URL and Redirect URLs (e.g., `https://yourdomain.com/api/auth/callback`).

## 2. Vercel Deployment
1. Import your GitHub repository into Vercel.
2. Select **Next.js** as the framework preset.
3. Configure Environment Variables in the Vercel dashboard (copy from your `.env.local`, excluding `NEXT_PUBLIC_APP_URL` which can be dynamic or set to the production URL).
4. Deploy the project.

## 3. Post-Deployment Checklist
- Verify Google OAuth login works on the production domain.
- Verify real-time subscriptions are active (if applicable).
- Enable Vercel Web Analytics.
- Check Supabase Database cron jobs (e.g., for archiving old exams or resetting streaks if implemented via cron).
