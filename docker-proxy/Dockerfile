FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY server.ts ./
ENV PORT=2375
EXPOSE 2375
CMD ["bun", "server.ts"]
