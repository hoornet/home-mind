# Shodh Memory Server
# Runs the pre-compiled Shodh binary
# Note: Ubuntu 24.04 needed for GLIBC 2.39 (Shodh binary requires 2.38+)
FROM ubuntu:24.04

WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-compiled binary and ONNX runtime (must be provided during build)
COPY shodh-memory-server /app/shodh-memory-server
COPY libonnxruntime.so /usr/lib/libonnxruntime.so
RUN chmod +x /app/shodh-memory-server && ldconfig

# Create data directory and symlink (Shodh uses /app/shodh_memory_data by default)
RUN mkdir -p /data && ln -s /data /app/shodh_memory_data

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
