FROM debian:12-slim

LABEL debian.version="12"

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# --- Base OS + LaTeX toolchain (pinned to debian:12-slim) -------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    gnupg \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-xetex \
    latexmk \
    texlive-extra-utils \
    git \
    curl \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- Node.js (pinned major) --------------------------------------------------
# Resume orchestrator (TypeScript) requires Node 20+ for the global fetch
# implementation used by the Perplexity / OpenAI / Anthropic / Google clients.
# Pin to the Node 22 LTS line for reproducibility.
ENV NODE_MAJOR=22
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Pin npm to match the package-lock.json lockfileVersion.
RUN npm install -g npm@10.9.0

RUN useradd -m vscode || true
USER vscode
WORKDIR /home/vscode/workspace
