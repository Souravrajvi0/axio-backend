# SpendGuard Backend API

Node.js/Express API for SpendGuard personal finance tracker.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure database connection:
   - Go to your Supabase Dashboard
   - Settings > Database > Database password
   - Copy the password
   - Update `.env`:
     ```env
     DATABASE_URL=postgresql://postgres:[password]@db.urwkdfgwmmevajcklwcr.supabase.co:5432/postgres
     ```

3. Start the server:
   ```bash
   npm start
   ```

4. Seed the database (first time only):
   ```bash
   npm run seed
   ```
   Or use the API endpoint: `POST /api/seed`

## API Endpoints

### Transactions
- `GET /api/transactions` - Get all transactions with filters
- `GET /api/transactions/:id` - Get single transaction
- `POST /api/transactions` - Create transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction
- `GET /api/transactions/stats` - Get statistics

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Accounts
- `GET /api/accounts` - Get all accounts
- `POST /api/accounts` - Create account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account

### Tags
- `GET /api/tags` - Get all tags
- `POST /api/tags` - Create tag
- `PUT /api/tags/:id` - Update tag
- `DELETE /api/tags/:id` - Delete tag

## Database

Uses PostgreSQL via Supabase. Schema is defined in the frontend project's `db/schema.sql`.

## Development

- Server runs on port 3000 by default
- CORS configured for frontend (localhost:5173)
- Error handling and logging included

## Deployment (Vercel)

1. **Push your code to GitHub**

2. **Import project to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository

3. **Set Environment Variables:**
   - In Vercel project settings, go to "Environment Variables"
   - Add `DATABASE_URL`:
     ```
     DATABASE_URL=postgresql://postgres:[password]@db.urwkdfgwmmevajcklwcr.supabase.co:5432/postgres
     ```
   - Replace `[password]` with your Supabase database password
   - Make sure to add it for **Production**, **Preview**, and **Development** environments

4. **Deploy:**
   - Vercel will automatically deploy after you push to your main branch
   - Your API will be available at `https://your-project.vercel.app`

5. **Seed the database:**
   - After deployment, seed your database by calling:
     ```bash
     curl -X POST https://your-project.vercel.app/api/seed
     ```
   - Or visit the endpoint in your browser (though POST requests need a tool like Postman)
   - This will create tables and populate initial data (categories, accounts, tags)

6. **Verify deployment:**
   - Check `/health` endpoint to verify database connection
   - Test API endpoints to ensure everything works