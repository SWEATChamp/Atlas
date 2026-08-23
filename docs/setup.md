# Setup Guide

## Prerequisites
- **Node.js**: v20.9+
- **Package Manager**: npm
- **Supabase CLI**: Required for local database development

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "A-Level Atlas"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in the missing values in `.env.local` using your Supabase project settings.

4. **Install Supabase CLI** (macOS)
   ```bash
   brew install supabase/tap/supabase
   ```

5. **Authenticate with Supabase**
   ```bash
   supabase login
   ```

6. **Link your Supabase project**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

7. **Run Database Migrations**
   This will execute all SQL files in `supabase/migrations/` to construct your database schema.
   ```bash
   supabase db push
   ```

8. **Start the Development Server**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3000`.

## Troubleshooting
- **Database Push Errors**: If `supabase db push` fails, verify your `project-ref` and ensure your database is empty before the first push. You can reset with `supabase db reset --linked`.
- **Authentication Issues**: Ensure your `.env.local` Supabase URLs and Anon keys match exactly what's in your Supabase Dashboard.
