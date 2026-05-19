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
# Node stays in the image for the frontend (Vite + React) build.
ENV NODE_MAJOR=22
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Pin npm to match the package-lock.json lockfileVersion.
RUN npm install -g npm@10.9.0

# --- Python + uv -------------------------------------------------------------
# The backend (FastAPI + Pydantic) runs on Python 3.12+. uv handles dependency
# resolution and installs lockfiles orders of magnitude faster than pip.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m vscode || true
USER vscode

# Install uv as the vscode user so its binaries land in $HOME/.local/bin.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/vscode/.local/bin:${PATH}"

WORKDIR /home/vscode/workspace
