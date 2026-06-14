FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm run install:all

COPY backend ./backend
COPY frontend ./frontend

RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV PORT=8000

COPY package.json ./
COPY backend/package.json ./backend/
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY frontend/dist ./frontend/dist

RUN npm install --prefix backend --omit=dev

EXPOSE 8000
CMD ["npm", "start"]
