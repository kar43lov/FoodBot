# Build stage - compile TypeScript and build web app
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build
COPY tsconfig.json ./
COPY src ./src

# Build backend
RUN npm run build

# Build web app
WORKDIR /app/src/web
COPY src/web/package.json src/web/package-lock.json* ./
RUN npm ci
COPY src/web ./
RUN npm run build

# Production stage - minimal runtime image
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy Prisma schema and regenerate for production
COPY prisma ./prisma
RUN npx prisma generate

# Copy built backend from builder
COPY --from=builder /app/dist ./dist

# Copy built web app from builder
COPY --from=builder /app/src/web/dist ./src/web/dist

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set environment defaults
ENV NODE_ENV=production \
    MODE=prod \
    PORT=3000 \
    HOST=0.0.0.0

# Use entrypoint for migrations
ENTRYPOINT ["/entrypoint.sh"]

# Start the application
CMD ["node", "dist/index.js"]
