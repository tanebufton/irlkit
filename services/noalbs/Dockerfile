# NOALBS — auto scene-switcher (flips OBS to BRB when the feed drops/degrades).
# No official or verified prebuilt image exists for this project (an earlier
# attempt to use one — 715209/noalbs — failed: that's the maintainer's GitHub
# username, not a Docker Hub namespace). Build from source instead, matching
# Cargo.toml's own musl-target support (it vendors OpenSSL specifically for
# x86_64-unknown-linux-musl), which the alpine-based Rust image targets natively.
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev openssl-dev perl make pkgconfig git
WORKDIR /build
RUN git clone --depth 1 --branch v2 https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching.git .
RUN cargo build --release

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /build/target/release/noalbs /usr/local/bin/noalbs
# Reads ./config.json (relative to CWD) unless CONFIG_DIR is set; we run a
# single user so we mount one config.json into /app instead. .env is read
# with dotenv().ok() (silently skipped if absent) — not needed since the
# Twitch chat integration is disabled via config.json's "chat": null.
ENTRYPOINT ["/usr/local/bin/noalbs"]
