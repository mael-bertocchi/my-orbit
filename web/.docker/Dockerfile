# Build stage
FROM node:24-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and lock file
COPY package*.json ./

# Install dependencies
RUN npm ci --include=dev

# Copy the rest of the code
COPY . .

# The API's origin, baked into the build
ARG VITE_API_URL

# Refuse to build without the API's origin
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL is required" >&2 && exit 1)

# Build the application
RUN npm run build

# Production stage
FROM caddy:alpine

# The API's origin again, for the Content-Security-Policy of the Caddyfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy the built files to Caddy's web root
COPY --from=builder /app/dist /usr/share/caddy

# Copy your Caddyfile config
COPY .docker/Caddyfile /etc/caddy/Caddyfile
