# =============================================================================
# AgentPod Central SSO Service
# =============================================================================
# Centralized oauth2-proxy service that handles authentication for all
# AgentPod containers. Uses Keycloak as the identity provider.
#
# All containers validate auth by calling this service's /oauth2/auth endpoint.
# Login redirects go through this service's /oauth2/start endpoint.
# =============================================================================

# Use Alpine-based image which has shell and wget for healthchecks
FROM quay.io/oauth2-proxy/oauth2-proxy:v7.6.0-alpine

# Copy configuration
COPY oauth2-proxy.cfg /etc/oauth2-proxy/oauth2-proxy.cfg

# Expose the oauth2-proxy port
EXPOSE 4180

# Health check using wget (available in Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:4180/ping || exit 1

# Run oauth2-proxy with config file
ENTRYPOINT ["oauth2-proxy", "--config=/etc/oauth2-proxy/oauth2-proxy.cfg"]
