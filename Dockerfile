FROM oven/bun:latest
WORKDIR /app

# Copy only package.json (Bun will safely install and generate what it needs)
COPY package.json ./
RUN bun install

# Copy ONLY the backend source code (prevents copying the frontend folder)
COPY src ./src

EXPOSE 3000
VOLUME ["/app/uploads"]

CMD ["bun", "run", "src/server.js"]