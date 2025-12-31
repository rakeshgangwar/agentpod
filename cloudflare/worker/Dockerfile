FROM docker.io/cloudflare/sandbox:0.6.7

ENV PATH="/root/.opencode/bin:${PATH}"

RUN curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh \
    && bash /tmp/install-opencode.sh \
    && rm /tmp/install-opencode.sh \
    && opencode --version

WORKDIR /home/user/workspace

EXPOSE 4096
