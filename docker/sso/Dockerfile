# =============================================================================
# AgentPod Central SSO Service
# =============================================================================
# Centralized oauth2-proxy service that handles authentication for all
# AgentPod containers. Uses Keycloak as the identity provider.
#
# All containers validate auth by calling this service's /oauth2/auth endpoint.
# Login redirects go through this service's /oauth2/start endpoint.
# =============================================================================

FROM quay.io/oauth2-proxy/oauth2-proxy:v7.6.0

# Copy configuration
COPY oauth2-proxy.cfg /etc/oauth2-proxy/oauth2-proxy.cfg

# Expose the oauth2-proxy port
EXPOSE 4180

# Note: No HEALTHCHECK defined here because the oauth2-proxy image is distroless
# (no shell, wget, or curl). Configure healthcheck in Coolify UI instead:
#   - Disable custom healthcheck, OR
#   - Use Coolify's HTTP healthcheck to GET http://localhost:4180/ping

# Run oauth2-proxy with config file
ENTRYPOINT ["oauth2-proxy", "--config=/etc/oauth2-proxy/oauth2-proxy.cfg"]
