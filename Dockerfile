FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN cd backend && npm install

RUN pip3 install --upgrade pip

RUN pip3 install -r python/requirements.txt

WORKDIR /app/backend

ENV PYTHON_BIN=python3

EXPOSE 8080

CMD ["npm", "start"]
