# How to Get Supabase Connection String for Vercel

## Step-by-Step Instructions

### Step 1: Go to Connection String Tab
1. Supabase Dashboard → **Settings** → **Database**
2. Scroll down to **"Connection String"** section
3. Click on **"Connection String"** tab (you're already here)

### Step 2: Switch to Session Pooler
1. Look at the **"Method"** dropdown (currently shows "Direct connection")
2. Click the dropdown and select **"Session Pooler"** or **"Connection Pooling"**
   - This will change the connection string to use port **6543** instead of 5432
   - This is what you need for Vercel!

### Step 3: Copy the Connection String
1. You'll see a connection string like:
   ```
   postgresql://postgres.urwkdfgwmmevajcklwcr:YOUR-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```
2. Replace `YOUR-PASSWORD` with your actual password: `DevRajvi@8086`
3. **URL-encode the password**: `@` becomes `%40`
4. Final string:
   ```
   postgresql://postgres.urwkdfgwmmevajcklwcr:DevRajvi%408086@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```

### Step 4: Update Vercel
1. Go to Vercel → Your Project → **Settings** → **Environment Variables**
2. Edit `DATABASE_URL`
3. Paste the connection string from Step 3
4. **Save**
5. **Redeploy** (uncheck "Use existing Build Cache")

## Alternative: Use "Transaction Pooler"
If you see "Transaction Pooler" option, that also works for serverless. It uses port **6543** as well.

## Key Differences

| Method | Port | Best For |
|--------|------|----------|
| Direct connection | 5432 | VMs, long-lived containers |
| Session Pooler | 6543 | Serverless (Vercel, Netlify) ✅ |
| Transaction Pooler | 6543 | Serverless (Vercel, Netlify) ✅ |

## Why Session Pooler?
- ✅ Works with IPv4 (no compatibility issues)
- ✅ Optimized for serverless functions
- ✅ Handles connection pooling automatically
- ✅ Prevents timeout issues

