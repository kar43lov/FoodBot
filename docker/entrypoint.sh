#!/bin/sh
set -e

echo "Starting Food Calories Bot..."
echo "Environment: ${MODE:-dev}"

# Run database migrations in production
if [ "$MODE" = "prod" ] && [ -n "$DATABASE_URL" ]; then
    echo "Running database migrations..."
    npx prisma migrate deploy
    echo "Migrations completed."
fi

# Execute the main command
exec "$@"
