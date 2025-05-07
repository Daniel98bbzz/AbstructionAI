# User Clusters Migration

This document describes the process for migrating the `user_clusters` table to support the new Supervisor Service features.

## Overview

The migration updates the `user_clusters` table to add new fields needed for enhanced prompt refinement:
- `learning_style_factor` (JSONB)
- `technical_depth_factor` (JSONB)
- `quiz_performance_factor` (JSONB)
- `feedback_pattern_factor` (JSONB)

It also creates a complementary `prompt_refinements` table to log all prompt refinements performed by the Supervisor.

## Migration Process

The migration follows these steps:
1. Backs up existing data from the `user_clusters` table
2. Drops the existing table
3. Creates the new table with the updated schema
4. Transfers data from the backup (if any exists)
5. Sets up security policies and indexes
6. Creates the `prompt_refinements` table if it doesn't exist

## Prerequisites

Before running the migration:

1. Ensure you have admin access to the Supabase project
2. Set up the environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` or `SUPABASE_ANON_KEY` (service key preferred)

> **Note:** If you don't have Supabase credentials handy, the scripts can still generate SQL files that you can run manually in the Supabase SQL Editor.

## Running the Migration

### Option 1: Using the Makefile

```bash
# First deploy the execute_sql function (required for the migration)
make deploy-function

# Then run the migration
make migrate-clusters

# Or run both steps together
make migration-all
```

### Option 2: Running Scripts Directly

```bash
# First deploy the execute_sql function
node scripts/deploy_sql_function.js

# Then run the migration
node scripts/migrate_clusters.js
```

### Option 3: Manual SQL Execution

The scripts now automatically generate output SQL files when no Supabase credentials are provided:
- `db/create_execute_sql_function_output.sql` - Contains the SQL to create the execute_sql function
- `db/migrate_user_clusters_output.sql` - Contains the SQL to migrate the user_clusters table

To use them:
1. Login to your Supabase dashboard
2. Go to the SQL Editor
3. Copy and paste the SQL from the output files
4. Run the queries in order (first the execute_sql function, then the user_clusters migration)

## Verification

After migration, verify:
1. The `user_clusters` table exists with the new schema
2. Any existing data has been transferred
3. The `prompt_refinements` table exists

## Rollback

If needed, the original data is backed up to `user_clusters_backup`. To rollback:
1. Recreate the original table schema
2. Copy data from the backup table

## Troubleshooting

If you encounter errors:
- Check the Supabase logs for SQL errors
- Ensure you have the correct permissions
- Verify environment variables are set correctly
- Try running the SQL directly in the Supabase SQL Editor 