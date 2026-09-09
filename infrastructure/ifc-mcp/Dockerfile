FROM node:22-bookworm-slim

ARG IFC_MCP_VERSION=0.13.1

WORKDIR /app

RUN npm init --yes \
  && npm install --omit=dev "@ifc-lite/mcp@${IFC_MCP_VERSION}" \
  && npm cache clean --force \
  && groupadd --system --gid 1001 ifcmcp \
  && useradd --system --uid 1001 --gid ifcmcp --home-dir /app ifcmcp \
  && mkdir -p /app/models \
  && chown -R ifcmcp:ifcmcp /app

COPY --chown=ifcmcp:ifcmcp infrastructure/ifc-mcp/server.mjs /app/server.mjs

ENV NODE_ENV=production
USER ifcmcp
EXPOSE 8765

CMD ["node", "/app/server.mjs"]
