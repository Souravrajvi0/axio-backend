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