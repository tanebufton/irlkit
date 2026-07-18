# Headless OBS Studio — composites the ingested feed and x264-encodes the program
# out to the destination. Runs against a virtual X display (Xvfb) with software
# OpenGL (llvmpipe), and a virtual PulseAudio sink so OBS's audio graph works.
#
# No GPU required. On a dedicated-vCPU box, software GL compositing + x264 handle
# 1080p60; a small GPU (NVENC) is a drop-in upgrade later.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/config
ENV DISPLAY=:99
# Force software GL so OBS starts without a real GPU.
ENV LIBGL_ALWAYS_SOFTWARE=1
ENV QT_QPA_PLATFORM=xcb

RUN apt-get update && apt-get install -y --no-install-recommends \
      software-properties-common gettext-base ca-certificates wget \
      xvfb x11-xserver-utils \
      pulseaudio pulseaudio-utils \
      libgl1-mesa-dri mesa-utils \
      fonts-dejavu-core \
 && add-apt-repository -y ppa:obsproject/obs-studio \
 && apt-get update && apt-get install -y --no-install-recommends \
      obs-studio \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Config templates (envsubst-expanded at boot) + entrypoint.
COPY config-templates/ /opt/config-templates/
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh && mkdir -p /config

EXPOSE 4455
ENTRYPOINT ["/opt/entrypoint.sh"]
