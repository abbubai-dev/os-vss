# Stage 1: Build the React Application
FROM oven/bun:1 as builder
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Copy the compiled files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html
# Override the default Nginx config with our custom proxy setup
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]