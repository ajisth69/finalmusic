FROM node:18-slim

WORKDIR /app

# Install Python, FFmpeg, and FORCE install the latest yt-dlp
# (This fixes the "No supported JavaScript runtime" error)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install -U pip \
    && pip3 install -U yt-dlp \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/bin/python

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy the rest of the app files
COPY . . 

# Expose port (Render needs this)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
