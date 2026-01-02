# Supabase Connection Guide for Vercel

## Important: Use Connection Pooler for Serverless

For Vercel (serverless functions), you should use **Connection Pooler** instead of direct connection.

## Get Connection String from Supabase

1. Go to Supabase Dashboard
2. **Settings** → **Database**
3. Scroll to **Connection String** section
4. Select **Connection Pooling** tab (NOT "Direct connection")
5. Copy the **URI** connection string

## Connection String Format

### Option 1: Connection Pooler (Recommended for Vercel)
```
postgresql://postgres.urwkdfgwmmevajcklwcr:DevRajvi%408086@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

**Note:** 
- Port is **6543** (pooler)
- Host is `aws-0-ap-south-1.pooler.supabase.com` (pooler host)
- This is optimized for serverless functions

### Option 2: Direct Connection (Not recommended for serverless)
```
postgresql://postgres:DevRajvi%408086@db.urwkdfgwmmevajcklwcr.supabase.co:5432/postgres
```

**Note:**
- Port is **5432** (direct)
- Can have timeout issues with serverless

## Update Vercel Environment Variable

1. Go to Vercel → Your Project → **Settings** → **Environment Variables**
2. Update `DATABASE_URL` with the **Connection Pooler** URI
3. **Redeploy** (uncheck "Use existing Build Cache")

## Why Connection Pooler?

- ✅ Better for serverless functions (Vercel, Netlify, etc.)
- ✅ Handles connection pooling automatically
- ✅ Prevents connection timeout issues
- ✅ More reliable for serverless environments

## Current Setup

Your current connection string uses direct connection (port 5432). For better reliability with Vercel, switch to the pooler (port 6543).

