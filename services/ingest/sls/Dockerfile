# SLS — SRT Live Server (irlserver fork, tuned for IRL / SRTLA / BELABOX).
# This build recipe mirrors the project's own Dockerfile as closely as
# possible: its build system is CMake + git submodules + a specific pinned
# SRT fork/commit, not the plain `./configure && make` most SRT tooling uses,
# and deviating from that exact recipe breaks the build (confirmed the hard
# way — see git history).
FROM alpine:3.21 AS build
RUN apk update && apk add --no-cache linux-headers alpine-sdk cmake tcl openssl-dev zlib-dev

WORKDIR /tmp
# MUST be the irlserver SRT fork (branch belabox), not upstream Haivision SRT —
# upstream compiles fine but drops packets under SRTLA bonding, per the
# irl-srt-server README. Commit pinned to the same known-good one upstream's
# own Dockerfile uses; bump deliberately from
# https://github.com/irlserver/srt/tree/belabox, not just to "latest".
ARG SRT_COMMIT=f2297192ce9ab572464e84228efbc46f8c1eabf4
RUN git clone https://github.com/irlserver/srt.git
WORKDIR /tmp/srt
RUN git checkout ${SRT_COMMIT} && ./configure && make -j"$(nproc)" && make install

WORKDIR /tmp
RUN git clone https://github.com/irlserver/irl-srt-server.git srt-live-server
WORKDIR /tmp/srt-live-server
RUN git submodule update --init
RUN cmake . -DCMAKE_BUILD_TYPE=Release
RUN make -j"$(nproc)"

FROM alpine:3.21
ENV LD_LIBRARY_PATH=/lib:/usr/lib:/usr/local/lib64
RUN apk update && apk add --no-cache openssl libstdc++ \
 && adduser -D srt && mkdir -p /etc/sls /logs && chown srt /logs
COPY --from=build /usr/local/bin/srt-* /usr/local/bin/
COPY --from=build /usr/local/lib/libsrt* /usr/local/lib/
COPY --from=build /tmp/srt-live-server/bin/* /usr/local/bin/
VOLUME /logs
# 4000 = player (internal, OBS pulls here) · 4001 = direct SRT publish (public)
# 4002 = SRTLA publish (internal, srtla_rec forwards here) · 8181 = stats API
EXPOSE 8181 4000/udp 4001/udp 4002/udp
USER srt
WORKDIR /home/srt
# The binary is named srt_server, not "sls" — easy to assume otherwise given
# the project/repo name.
ENTRYPOINT ["srt_server", "-c", "/etc/sls/sls.conf"]
