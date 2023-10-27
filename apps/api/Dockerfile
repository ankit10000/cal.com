# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.7.0
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="Next.js/Prisma"

# Next.js/Prisma app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base as build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install -y build-essential openssl pkg-config python-is-python3


COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json git-init.sh git-setup.sh ./
COPY /.yarn ./.yarn
COPY /apps/api ./apps/api
COPY /packages ./packages
COPY /apps/web ./apps/web

# Install node modules
RUN yarn config set httpTimeout 1200000 && \ 
    npx turbo prune --scope=@calcom/web --docker && \
    npx turbo prune --scope=@calcom/api --docker && \
    yarn install



# Build application
RUN yarn turbo run build --filter=@calcom/api


# Final stage for app image
FROM base

# Install packages needed for deployment
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3002
CMD [ "yarn", "start-api"]
