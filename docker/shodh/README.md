# Shodh Memory Container

This container runs the Shodh Memory server.

## Building

Before building, you need to place the `shodh-memory-server` binary in this directory.

### Option 1: Copy from existing installation
```bash
cp ~/shodh-memory-server ./shodh-memory-server
```

### Option 2: Download release
Check https://github.com/varun29ankuS/shodh-memory for releases.

### Build
```bash
docker build -t home-mind-shodh .
```

## Running standalone
```bash
docker run -d \
  --name shodh \
  -p 3030:3030 \
  -e SHODH_DEV_API_KEY=your-api-key \
  -v shodh_data:/data \
  home-mind-shodh
```
