# SRTLA receiver — the BELABOX bonding protocol. Streamers on flaky cellular run
# multiple modems; srtla_rec reassembles the bonded links into one SRT stream and
# forwards it to SLS. This is what makes irlkit viable on real mobile connections.
FROM alpine:3.20 AS build
RUN apk add --no-cache git build-base linux-headers
RUN git clone --depth 1 https://github.com/BELABOX/srtla /tmp/srtla \
 && cd /tmp/srtla && make -j"$(nproc)"

FROM alpine:3.20
RUN apk add --no-cache libstdc++
COPY --from=build /tmp/srtla/srtla_rec /usr/local/bin/srtla_rec
EXPOSE 5000/udp
# Args supplied by docker-compose: <listen_port> <srt_host> <srt_port>
ENTRYPOINT ["srtla_rec"]
