FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS build
WORKDIR /app/artifacts/escape-hatch
COPY artifacts/escape-hatch/package.json artifacts/escape-hatch/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY artifacts/escape-hatch/ ./
COPY contracts/application-journey-scenes.v1.json /app/contracts/
COPY harness/contracts/application-form-taxonomy.v1.json /app/harness/contracts/
COPY browser/application-assist/manifest.json /app/browser/application-assist/
RUN VITE_ESCAPEHATCH_CONTAINER=1 npm run build

FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752
WORKDIR /app/artifacts/escape-hatch
ENV NODE_ENV=production ESCAPEHATCH_DATA_HOME=/workspace PORT=21030
COPY --from=build /app /app
RUN install -d -m 0700 -o node -g node /workspace && install -m 0600 -o node -g node /dev/null /workspace/.escapehatch
USER node
EXPOSE 21030
ENTRYPOINT ["node", "--experimental-strip-types", "container-server.ts"]
CMD ["serve"]
