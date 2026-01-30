# Shodh Memory Server
# Runs the pre-compiled Shodh binary
FROM debian:bookworm-slim

WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-compiled binary (must be provided during build)
COPY shodh-memory-server /app/shodh-memory-server
RUN chmod +x /app/shodh-memory-server

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3030/health || exit 1

# Environment defaults
ENV SHODH_HOST=0.0.0.0
ENV SHODH_PORT=3030
ENV SHODH_DATA_DIR=/data

# Start server
CMD ["/app/shodh-memory-server"]
