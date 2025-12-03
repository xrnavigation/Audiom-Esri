# ArcGIS Experience Builder - Server
# Multi-stage build to keep final image clean

ARG EXB_VERSION=1.19
ARG NODE_VERSION=22
ARG SERVER_PORT=3000

# Stage 1: Download and extract ArcGIS
FROM python:3.11-slim AS downloader

ARG EXB_VERSION

ENV EXB_VERSION=${EXB_VERSION}
WORKDIR /download

# Install dependencies for the utility scripts
RUN pip install --no-cache-dir requests beautifulsoup4

# Copy utility scripts
COPY utils/exb-versions.py ./
COPY utils/download-arcgis.py ./

# Download the ArcGIS Experience Builder zip file
RUN python download-arcgis.py ${EXB_VERSION}

# Extract only the server directory from the zip
RUN apt-get update && apt-get install -y unzip && \
    unzip -q arcgis-experience-builder-${EXB_VERSION}.zip -d ArcGISExperienceBuilder && \
    rm -rf arcgis-experience-builder-${EXB_VERSION}.zip


# Stage 2: Build the final image with the correct Node version
FROM node:${NODE_VERSION}-alpine AS runtime

ARG EXB_VERSION
ARG NODE_VERSION
ARG SERVER_PORT

ENV EXB_VERSION=${EXB_VERSION}
ENV NODE_VERSION=${NODE_VERSION}
ENV SERVER_PORT=${SERVER_PORT}

WORKDIR /app

# Copy both client and server from the extracted files
COPY --from=downloader /download/ArcGISExperienceBuilder ./

# Install dependencies for both client and server
RUN cd client && npm ci && npm cache clean --force && \
    cd ../server && npm ci && npm cache clean --force

# Copy startup script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-check-certificate --quiet --tries=1 --spider http://localhost:${SERVER_PORT} || exit 1

# Start both client and server
CMD ["/entrypoint.sh"]
