# syntax=docker/dockerfile:1

# Stage 1: Build
FROM golang:1.26 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /agentpod-node ./cmd/agentpod-node

# Stage 2: Runtime
# alpine used so the shell entrypoint script can run
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /agentpod-node /agentpod-node
COPY deploy/node-entrypoint.sh /node-entrypoint.sh
RUN chmod +x /node-entrypoint.sh
ENTRYPOINT ["/node-entrypoint.sh"]
