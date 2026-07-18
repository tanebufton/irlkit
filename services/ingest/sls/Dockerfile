# SLS — SRT Live Server (irlserver fork, tuned for IRL / SRTLA / BELABOX).
# Receives plain SRT publishers and the de-bonded output of the srtla receiver,
# and republishes so OBS can pull the feed as a media source.
FROM alpine:3.20 AS build

RUN apk add --no-cache \
      git g++ make cmake linux-headers tcl openssl-dev zlib-dev

# Build SRT library.
RUN git clone --depth 1 --branch v1.5.3 https://github.com/Haivision/srt /tmp/srt \
 && cd /tmp/srt \
 && ./configure --prefix=/usr/local \
 && make -j"$(nproc)" && make install

# Build SLS against it.
RUN git clone --depth 1 https://github.com/irlserver/irl-srt-server /tmp/sls \
 && cd /tmp/sls \
 && make -j"$(nproc)" \
 && cp bin/sls /usr/local/bin/sls

FROM alpine:3.20
RUN apk add --no-cache libstdc++ openssl zlib
COPY --from=build /usr/local/bin/sls /usr/local/bin/sls
COPY --from=build /usr/local/lib/libsrt* /usr/local/lib/
RUN ldconfig /usr/local/lib 2>/dev/null || true
EXPOSE 4001/udp 8181
ENTRYPOINT ["sls", "-c", "/etc/sls/sls.conf"]
