#!/bin/sh
set -eu

attempt=1
max_attempts="${DB_STARTUP_MAX_ATTEMPTS:-15}"

until ./node_modules/.bin/prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "No fue posible preparar la base de datos tras ${max_attempts} intentos." >&2
    exit 1
  fi

  echo "La base de datos aun no esta lista; reintentando (${attempt}/${max_attempts})..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

if [ "${SEED_ON_FIRST_RUN:-false}" = "true" ]; then
  npm run seed:demo
fi

exec node dist/main.js
