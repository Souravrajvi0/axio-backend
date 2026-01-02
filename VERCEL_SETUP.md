# Vercel Environment Variable Setup Guide

## Problem
If you see `"database": "not configured"` in the `/health` endpoint, it means `DATABASE_URL` is not set in Vercel.

## Solution: Add DATABASE_URL to Vercel

### Step 1: Get Your Connection String

Your connection string should be:
```
postgresql://postgres:DevRajvi%408086@db.urwkdfgwmmevajcklwcr.supabase.co:5432/postgres?sslmode=require
```

**Important:** 
- The `@` in your password must be URL-encoded as `%40`
- Add `?sslmode=require` at the end for Supabase SSL connection

### Step 2: Add to Vercel

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in and select your project (`axio-backend`)

2. **Navigate to Settings**
   - Click on your project
   - Go to **Settings** tab
   - Click **Environment Variables** in the sidebar

3. **Add New Variable**
   - Click **Add New**
   - **Name:** `DATABASE_URL`
   - **Value:** `postgresql://postgres:DevRajvi%408086@db.urwkdfgwmmevajcklwcr.supabase.co:5432/postgres?sslmode=require`
   - **Environment:** Select **ALL** (Production, Preview, Development)
   - Click **Save**

4. **Redeploy**
   - Go to **Deployments** tab
   - Find your latest deployment
   - Click the **three dots** (⋯) menu
   - Click **Redeploy**
   - Make sure to check **"Use existing Build Cache"** is **UNCHECKED** (so it picks up the new env var)

### Step 3: Verify

After redeployment (usually takes 1-2 minutes):

1. **Check Health Endpoint:**
   ```
   https://axio-backend.vercel.app/health
   ```
   Should show: `"database": "connected"`

2. **Test API Endpoints:**
   ```
   https://axio-backend.vercel.app/api/categories
   https://axio-backend.vercel.app/api/accounts
   https://axio-backend.vercel.app/api/tags
   ```

3. **Seed Database (if not done):**
   ```bash
   POST https://axio-backend.vercel.app/api/seed
   ```

## Common Issues

### Issue: Still shows "not configured" after adding
**Solution:**
- Make sure you **redeployed** after adding the variable
- Check that the variable is set for **Production** environment
- Verify the connection string is correct (no extra spaces, correct encoding)

### Issue: "connection failed" error
**Solution:**
- Check your Supabase database password is correct
- Verify the database host is accessible
- Check Supabase dashboard to ensure database is running

### Issue: Password with special characters
**Solution:**
- URL-encode special characters:
  - `@` → `%40`
  - `#` → `%23`
  - `$` → `%24`
  - `%` → `%25`
  - `&` → `%26`
  - `+` → `%2B`
  - `=` → `%3D`

## Quick Test

You can test your connection string locally first:

1. Create `.env` file:
   ```env
   DATABASE_URL=postgresql://postgres:DevRajvi%408086@db.urwkdfgwmmevajcklwcr.supabase.co:5432/postgres
   ```

2. Run:
   ```bash
   npm start
   ```

3. Visit: `http://localhost:3000/health`

If it works locally but not on Vercel, the issue is definitely the environment variable not being set correctly in Vercel.

