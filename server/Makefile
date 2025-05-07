# Makefile for Supervisor Service database operations

.PHONY: help deploy-function migrate-clusters migration-all

# Default target
help:
	@echo "Available commands:"
	@echo "  make deploy-function   - Deploy the execute_sql function to Supabase"
	@echo "  make migrate-clusters  - Migrate the user_clusters table to the new schema"
	@echo "  make migration-all     - Run both deployment and migration"

# Deploy the execute_sql function to Supabase
deploy-function:
	@echo "Deploying execute_sql function..."
	node scripts/deploy_sql_function.js

# Migrate the user_clusters table
migrate-clusters:
	@echo "Migrating user_clusters table..."
	node scripts/migrate_clusters.js

# Run both deployment and migration
migration-all: deploy-function migrate-clusters
	@echo "Migration completed successfully!" 